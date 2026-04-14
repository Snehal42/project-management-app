$content = Get-Content "index.js" -Raw

# Add the debug route
$debugRoute = "
// Connection debug route
app.get('/debug-db', async (req, res) => {
    try {
        const dbStatus = {
            host: process.env.DB_HOST ? 'SET' : 'MISSING',
            user: process.env.DB_USER ? 'SET' : 'MISSING',
            db: process.env.DB_NAME ? 'SET' : 'MISSING',
            ssl: process.env.DB_SSL,
            env: process.env.NODE_ENV
        };

        const [rows] = await pool.query('SELECT 1 as connection_test');
        res.json({
            success: true,
            configuration: dbStatus,
            message: 'Successfully connected',
            data: rows
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: 'Database failed',
            error_code: err.code,
            error_message: err.message
        });
    }
});
"

# Inject before error handler
if ($content -notlike "*/debug-db*") {
    $content = $content -replace "// Global Error Handler", ($debugRoute + "`n`n// Global Error Handler")
}

Set-Content "index.js" $content -NoNewline
