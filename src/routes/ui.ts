import { Hono } from 'hono'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const app = new Hono()

const styles = `
:root {
  --primary: #6366f1;
  --secondary: #a855f7;
  --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
  --glass-bg: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
}
body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; background: var(--bg-gradient); min-height: 100vh; color: var(--text-primary); overflow-x: hidden; }
.blob { position: absolute; width: 500px; height: 500px; background: linear-gradient(180deg, rgba(99, 102, 241, 0.3) 0%, rgba(168, 85, 247, 0.3) 100%); filter: blur(80px); border-radius: 50%; z-index: -1; animation: float 20s infinite alternate; }
.blob-1 { top: -100px; left: -100px; }
.blob-2 { bottom: -100px; right: -100px; animation-delay: -10s; }
@keyframes float { 0% { transform: translate(0, 0) scale(1); } 100% { transform: translate(30px, 50px) scale(1.1); } }
.container { max-width: 1200px; margin: 0 auto; padding: 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 90vh; }
.glass-card { background: var(--glass-bg); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1px solid var(--glass-border); border-radius: 24px; padding: 4rem; text-align: center; box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37); max-width: 800px; width: 100%; }
h1 { font-size: 4rem; font-weight: 800; margin-bottom: 1rem; background: linear-gradient(to right, #818cf8, #c084fc); -webkit-background-clip: text; -webkit-text-fill-color: transparent; line-height: 1.1; }
p.subtitle { font-size: 1.5rem; color: var(--text-secondary); margin-bottom: 3rem; line-height: 1.6; }
.btn { display: inline-block; padding: 1rem 2.5rem; font-size: 1.1rem; font-weight: 600; text-decoration: none; color: white; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 12px; transition: all 0.3s ease; margin: 0 0.5rem; }
.btn:hover { background: rgba(255, 255, 255, 0.2); transform: translateY(-2px); box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); }
.btn-primary { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); border: none; }
.btn-primary:hover { background: linear-gradient(135deg, #5558e6 0%, #7c3aed 100%); }
footer { margin-top: auto; padding: 2rem; text-align: center; color: rgba(255, 255, 255, 0.4); font-size: 0.9rem; }
.docs-container { max-width: 1000px; margin: 2rem auto; padding: 2rem; }
.docs-card { text-align: left; padding: 3rem; }
.markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; color: #e2e8f0; }
.markdown-body h1, .markdown-body h2 { border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.3em; }
.markdown-body pre { background: rgba(0,0,0,0.3) !important; border-radius: 12px !important; border: 1px solid rgba(255,255,255,0.1); }
.markdown-body a { color: #818cf8; }
.markdown-body code { background: rgba(255,255,255,0.1) !important; color: #e2e8f0 !important; }
`

app.get('/', (c) => {
    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoreBase API Gateway</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>${styles}</style>
</head>
<body>
    <div class="blob blob-1"></div>
    <div class="blob blob-2"></div>
    <div class="container">
        <div class="glass-card">
            <h1>CoreBase<br>API Gateway</h1>
            <p class="subtitle">The next-generation Backend-as-a-Service platform. <br>Build faster, scale smarter, and ship instantly.</p>
            <div class="actions">
                <a href="/docs" class="btn btn-primary">Read Documentation</a>
                <a href="/health" class="btn">System Health</a>
            </div>
        </div>
    </div>
    <footer>&copy; ${new Date().getFullYear()} CoreBase. All systems operational.</footer>
</body>
</html>`)
})

app.get('/docs', async (c) => {
    let docsContent = ''
    try {
        docsContent = await readFile(join(process.cwd(), 'API_DOCUMENTATION.md'), 'utf-8')
    } catch (e) {
        docsContent = '# Error\nCould not load documentation.'
    }
    // Sanitize for script injection in JS string
    const safeContent = JSON.stringify(docsContent)

    return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CoreBase API Documentation</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.2.0/github-markdown-dark.min.css">
    <style>${styles} .markdown-body { background: transparent !important; }</style>
</head>
<body>
    <div class="blob blob-1" style="height: 300px; width: 300px;"></div>
    <nav style="padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; background: rgba(0,0,0,0.2); backdrop-filter: blur(10px);">
        <a href="/" style="color: white; text-decoration: none; font-weight: 800; font-size: 1.2rem;">CoreBase</a>
        <a href="/" class="btn" style="padding: 0.5rem 1rem; font-size: 0.9rem;">Back to Home</a>
    </nav>
    <div class="docs-container">
        <div class="glass-card docs-card">
            <div id="content" class="markdown-body"></div>
        </div>
    </div>
    <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
    <script>
        const markdown = ${safeContent};
        document.getElementById('content').innerHTML = marked.parse(markdown);
    </script>
</body>
</html>`)
})

export default app
