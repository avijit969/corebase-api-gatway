import Database from "bun:sqlite"
import * as fs from "node:fs"
import { getProjectDbPath } from "../controllers/tables"

/* ---------------------------------- TYPES --------------------------------- */

export interface QueryJoin {
    table: string
    on: Record<string, string>
    select?: string[]
    join?: QueryJoin[]
}

export interface QueryOptions {
    from: string
    select?: string[] | "*"
    where?: Record<string, any>
    limit?: number
    orderBy?: string
    order?: "ASC" | "DESC"
    join?: QueryJoin[]
}

interface RunQueryContext {
    projectId: string
    userId: string
}

/* ------------------------------- CONSTANTS -------------------------------- */

const MAX_JOIN_DEPTH = 3
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/
const SAFE_DOTTED = /^[a-zA-Z0-9_]+\.[a-zA-Z0-9_]+$/

/* ------------------------------ WHERE BUILDER ------------------------------ */

const buildWhereClause = (
    where: Record<string, any>,
    params: any[]
): string => {
    const conditions: string[] = []

    for (const [key, value] of Object.entries(where)) {
        if (!SAFE_DOTTED.test(key) && !SAFE_IDENTIFIER.test(key)) continue

        const col = key.includes(".")
            ? `"${key.split(".")[0]}"."${key.split(".")[1]}"`
            : `"${key}"`

        if (typeof value === "object" && value !== null) {
            const [op, val] = Object.entries(value)[0]

            switch (op) {
                case "eq":
                    conditions.push(`${col} = ?`)
                    params.push(val)
                    break
                case "gt":
                    conditions.push(`${col} > ?`)
                    params.push(val)
                    break
                case "lt":
                    conditions.push(`${col} < ?`)
                    params.push(val)
                    break
                case "in":
                    if (Array.isArray(val) && val.length > 0) {
                        conditions.push(`${col} IN (${val.map(() => "?").join(",")})`)
                        params.push(...val)
                    }
                    break
            }
        } else {
            conditions.push(`${col} = ?`)
            params.push(value)
        }
    }

    return conditions.length ? `WHERE ${conditions.join(" AND ")}` : ""
}

/* ------------------------------ JOIN BUILDER ------------------------------- */

const processJoins = (
    joins: QueryJoin[],
    depth = 0
): { sql: string; selects: string[] } => {
    if (depth > MAX_JOIN_DEPTH) {
        throw new Error("Max join depth exceeded")
    }

    const sqlParts: string[] = []
    const selectParts: string[] = []

    for (const join of joins) {
        if (!SAFE_IDENTIFIER.test(join.table)) continue

        const onParts: string[] = []

        for (const [l, r] of Object.entries(join.on)) {
            if (SAFE_DOTTED.test(l) && SAFE_DOTTED.test(r)) {
                const [lt, lc] = l.split(".")
                const [rt, rc] = r.split(".")
                onParts.push(`"${lt}"."${lc}" = "${rt}"."${rc}"`)
            }
        }

        if (!onParts.length) continue

        sqlParts.push(
            `LEFT JOIN "${join.table}" ON ${onParts.join(" AND ")}`
        )

        if (join.select) {
            for (const col of join.select) {
                if (SAFE_IDENTIFIER.test(col)) {
                    const alias = `${join.table}__${col}`
                    selectParts.push(
                        `"${join.table}"."${col}" AS "${alias}"`
                    )
                }
            }
        }

        if (join.join) {
            const nested = processJoins(join.join, depth + 1)
            sqlParts.push(nested.sql)
            selectParts.push(...nested.selects)
        }
    }

    return {
        sql: sqlParts.join(" "),
        selects: selectParts
    }
}

/* ------------------------------ MAIN QUERY -------------------------------- */

export const runQuery = async (
    query: QueryOptions,
    ctx: RunQueryContext
) => {
    const dbPath = getProjectDbPath(ctx.projectId)
    if (!fs.existsSync(dbPath)) {
        throw new Error("Project database not found")
    }

    const db = new Database(dbPath)

    try {
        if (!SAFE_IDENTIFIER.test(query.from)) {
            throw new Error("Invalid table name")
        }

        /* ------------------------------ SELECT -------------------------------- */

        const selectColumns: string[] =
            query.select === "*" || !query.select
                ? [`"${query.from}".*`]
                : query.select
                    .filter(c => SAFE_IDENTIFIER.test(c))
                    .map(c => `"${query.from}"."${c}"`)

        /* ------------------------------- JOINS -------------------------------- */

        let joinSQL = ""
        if (query.join) {
            const joinResult = processJoins(query.join)
            joinSQL = joinResult.sql
            selectColumns.push(...joinResult.selects)
        }

        /* ------------------------------- WHERE -------------------------------- */

        const params: any[] = []

        // 🔐 RLS Injection (MANDATORY)
        const rlsWhere = {
            user_id: { eq: ctx.userId },
            ...(query.where || {})
        }

        const whereSQL = buildWhereClause(rlsWhere, params)

        /* ------------------------------ ORDER --------------------------------- */

        let orderSQL = ""
        if (query.orderBy) {
            if (!SAFE_IDENTIFIER.test(query.orderBy) && !SAFE_DOTTED.test(query.orderBy)) {
                throw new Error("Invalid orderBy")
            }

            const col = query.orderBy.includes(".")
                ? `"${query.orderBy.split(".")[0]}"."${query.orderBy.split(".")[1]}"`
                : `"${query.from}"."${query.orderBy}"`

            orderSQL = `ORDER BY ${col} ${query.order === "DESC" ? "DESC" : "ASC"}`
        }

        /* ------------------------------ LIMIT --------------------------------- */

        let limitSQL = ""
        if (query.limit && query.limit > 0) {
            limitSQL = `LIMIT ?`
            params.push(query.limit)
        }

        /* ------------------------------- SQL ---------------------------------- */

        const sql = `
      SELECT ${selectColumns.join(", ")}
      FROM "${query.from}"
      ${joinSQL}
      ${whereSQL}
      ${orderSQL}
      ${limitSQL}
    `

        const rows = db.prepare(sql).all(...params)

        /* --------------------------- HYDRATE JOINS ----------------------------- */

        if (!query.join?.length) return rows

        return rows.map(row => {
            const root: any = {}
            const joinBuckets: Record<string, any> = {}

            for (const [k, v] of Object.entries(row)) {
                if (k.includes("__")) {
                    const [table, col] = k.split("__")
                    joinBuckets[table] ??= {}
                    joinBuckets[table][col] = v
                } else {
                    root[k] = v
                }
            }

            const hydrate = (obj: any, joins: QueryJoin[]) => {
                for (const j of joins) {
                    const data = joinBuckets[j.table]
                    obj[j.table] = data && Object.values(data).some(v => v !== null)
                        ? data
                        : null

                    if (j.join && obj[j.table]) {
                        hydrate(obj[j.table], j.join)
                    }
                }
            }

            hydrate(root, query.join)
            return root
        })

    } finally {
        db.close()
    }
}
