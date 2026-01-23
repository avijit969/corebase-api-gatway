import { Hono } from "hono";
import { insertTable, updateTable, deleteTable, queryTablesData, testRoute } from "../controllers/table_operation";

const route = new Hono()

route.post('/insert/:table_name', insertTable)
route.put('/update/:table_name', updateTable)
route.delete('/delete/:table_name', deleteTable)
route.post('/select/:table_name', queryTablesData)


export default route