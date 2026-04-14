$content = Get-Content "index.js" -Raw

# 1. Add fs import if it doesn't exist
if ($content -notlike "*const fs = require('fs')*") {
    $content = $content -replace "const mysql = require\('mysql2/promise'\);", "const mysql = require('mysql2/promise');`nconst fs = require('fs');"
}

# 2. Replace the pool block
$poolPattern = '(?s)// Create a connection pool.*?const pool = mysql\.createPool\(\{.*?\}\);'
$newPool = '// Create a connection pool (Optimized for Vercel & TiDB)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: parseInt(process.env.DB_PORT) || 4000,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0,
    ssl: (process.env.NODE_ENV === "production" || process.env.DB_SSL === "true") ? {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2"
    } : false
});'

$content = $content -replace $poolPattern, $newPool

Set-Content "index.js" $content -NoNewline
