require('dotenv').config();
const mysql = require('mysql2/promise');

async function testDatabase() {
    console.log('🚀 Starting CI Database Validation...');
    
    // Connection config (will be provided by GitHub Actions Env)
    const config = {
        host: process.env.DB_HOST || '127.0.0.1',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'password',
        database: process.env.DB_NAME || 'test_db',
        port: process.env.DB_PORT || 3306
    };

    let connection;
    try {
        connection = await mysql.createConnection(config);
        console.log('✅ Successfully connected to CI Database.');

        // Verify key tables exist
        const [tables] = await connection.execute('SHOW TABLES');
        const tableNames = tables.map(t => Object.values(t)[0]);
        
        const requiredTables = ['admins', 'projects', 'students', 'payments', 'expenses', 'transactions'];
        const missingTables = requiredTables.filter(t => !tableNames.includes(t));

        if (missingTables.length > 0) {
            throw new Error(`❌ Missing required tables: ${missingTables.join(', ')}`);
        }

        console.log(`✅ All ${requiredTables.length} core tables found in schema.`);

        // Sanity check on 'projects' table columns
        const [columns] = await connection.execute('DESCRIBE projects');
        const hasStatus = columns.some(c => c.Field === 'project_status');
        
        if (!hasStatus) {
            throw new Error('❌ "projects" table is missing "project_status" column!');
        }

        console.log('✅ "projects" table structure validated.');
        console.log('🎊 CI Database Test Passed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ CI Database Validation Failed:');
        console.error(error.message);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

testDatabase();
