require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');

const app = express();

// Security and Middleware setup
app.use(helmet({
    contentSecurityPolicy: false, // Disable for EJS development if needed, or configure properly
}));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "/views"));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true, // Prevents XSS from reading the cookie
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
    }
}));

// Create a connection pool (Optimized for Vercel & TiDB)
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
});

// Authentication Middleware
const isAuthenticated = (req, res, next) => {
    if (req.session.adminId) {
        return next();
    }
    res.redirect("/login");
};

// Make username available in ALL templates automatically
app.use((req, res, next) => {
    res.locals.username = req.session.username || null;
    next();
});


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


// Global Error Handler Helper
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};



app.get("/", (req, res) => {
    res.render("home.ejs");
});

app.get("/login", (req, res) => {
    res.render("login.ejs");
});

app.get("/dashboard", isAuthenticated, asyncHandler(async (req, res) => {
    // 1. Ongoing Projects count
    const [ongoing] = await pool.execute("SELECT COUNT(*) as count FROM projects WHERE project_status != 'Completed'");
    // 2. Deadline Approaching count (<= 5 days)
    const [deadline] = await pool.execute("SELECT COUNT(*) as count FROM projects WHERE project_status != 'Completed' AND deployment_date IS NOT NULL AND DATEDIFF(deployment_date, CURDATE()) <= 5");
    // 3. Total transactions
    const [transactions] = await pool.execute("SELECT COUNT(*) as count FROM transactions");

    res.render("dashboard.ejs", { 
        activePage: 'dashboard',
        ongoingCount: ongoing[0].count,
        deadlineCount: deadline[0].count,
        transactionsCount: transactions[0].count
    });
}));

app.post("/login", asyncHandler(async (req, res) => {
    const { username, password } = req.body;

    // Database lookup
    const [rows] = await pool.execute('SELECT * FROM admins WHERE username = ?', [username]);
    
    if (rows.length > 0) {
        const admin = rows[0];
        const match = await bcrypt.compare(password, admin.password_hash);
        
        if (match) {
            req.session.adminId = admin.admin_id;
            req.session.username = admin.username;
            console.log(`Admin ${username} logged in`);
            return res.redirect("/dashboard");
        }
    }

    res.render("login.ejs", { error: "Invalid username or password" });
}));

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.redirect("/login");
});

// app.get("/projects", (req, res) => {
//     query = "SELECT * FROM projects";

//     try{ 
//         connection.query(query, (err, results) => {
//         if (err) throw err;
//         let projects = results;
//         console.log(results);
//         res.render("projects.ejs", { projects: projects });
//         });
//     }catch(err){
//         console.error(err);
//         res.send("Database Error");
//     }        
    
// });
app.get("/projects", isAuthenticated, asyncHandler(async (req, res) => {
    let search = req.query.search;
    let query;
    let values = [];

    if (search) {
        query = "SELECT * FROM projects WHERE project_name LIKE ?";
        values = [`%${search}%`];
    } else {
        query = "SELECT * FROM projects";
    }

    const [results] = await pool.execute(query, values);
    // Calculate days remaining
    const today = new Date();
    today.setHours(0, 0, 0, 0); // normalize today

    const formattedResults = results.map(p => {
        let days_remaining = null;
        if (p.deployment_date && p.project_status !== "Completed") {
            const deployDate = new Date(p.deployment_date);
            deployDate.setHours(0, 0, 0, 0);
            const diffTime = deployDate - today;
            days_remaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        }
        return { ...p, days_remaining };
    });

    res.render("projects.ejs", { projects: formattedResults, search, activePage: 'projects' });
}));



app.get("/transactions", isAuthenticated, asyncHandler(async (req, res) => {
    const [transactions] = await pool.execute("SELECT * FROM transactions ORDER BY transaction_date DESC");
    console.log("Transactions loaded successfully");
    res.render("transaction.ejs", { transactions, activePage: 'transactions' });
}));

app.get("/projects/:id/details", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.id;

    // Fetch project info first (always needed for header + nav)
    const [projectRows] = await pool.execute("SELECT * FROM projects WHERE project_id = ?", [projectId]);
    if (projectRows.length === 0) return res.status(404).send("Project not found");

    const project = projectRows[0];

    // Fetch students joined with project
    const q = `
        SELECT s.*, p.project_name, p.college
        FROM student_detail s
        JOIN projects p ON s.project_id = p.project_id
        WHERE s.project_id = ?
    `;
    const [details] = await pool.execute(q, [projectId]);
    res.render("details.ejs", { details, project, activePage: 'projects' });
}));
app.get("/projects/:id/expense", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.id;

    const [projectRows] = await pool.execute("SELECT * FROM projects WHERE project_id = ?", [projectId]);
    if (projectRows.length === 0) return res.status(404).send("Project not found");
    const project = projectRows[0];

    const q = `
        SELECT e.*, p.project_name, p.college
        FROM expense e
        JOIN projects p ON e.project_id = p.project_id
        WHERE e.project_id = ?
    `;
    const [expense_details] = await pool.execute(q, [projectId]);
    res.render("expense.ejs", { expense_details, project, activePage: 'projects' });
}));
app.get("/projects/:id/paymentStatus", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.id;

    const [projectRows] = await pool.execute("SELECT * FROM projects WHERE project_id = ?", [projectId]);
    if (projectRows.length === 0) return res.status(404).send("Project not found");
    const project = projectRows[0];

    const q = `
        SELECT ps.*, p.project_name, p.college
        FROM payment_status ps
        JOIN projects p ON ps.project_id = p.project_id
        WHERE ps.project_id = ?
    `;
    const [payment_details] = await pool.execute(q, [projectId]);
    res.render("paymentStatus.ejs", { payment_details, project, activePage: 'projects' });
}));

const port = 8080;
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

app.get("/projects/new", isAuthenticated, (req, res) => {
    res.render("add_project", { activePage: 'projects' });
});

app.post("/projects/new", isAuthenticated, [
    body('project_name').trim().notEmpty().withMessage('Project name is required').isLength({ max: 150 }),
    body('college').trim().isLength({ max: 150 }),
    body('city').trim().isLength({ max: 100 }),
    body('project_status').isIn(['Pending', 'In Progress', 'Completed']),
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render("add_project", { errors: errors.array(), activePage: 'projects' });
    }

    const { project_name, college, city, project_status, remark, deployment_date } = req.body;
    const projectID = uuidv4();

    const sql = `
        INSERT INTO projects 
        (project_id, project_name, college, city, project_status, remark, deployment_date)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    await pool.execute(sql, [projectID, project_name, college, city, project_status, remark, deployment_date || null]);
    res.redirect(`/projects/new/group/${projectID}`);
}));


// Load Add Student Page
app.get("/projects/new/group/:projectId", isAuthenticated, (req, res) => {
    res.render("addgroup", { project_id: req.params.projectId, activePage: 'projects' });
});

app.post("/projects/new/group/:projectId", isAuthenticated, [
    body('student_name').trim().notEmpty().withMessage('Student name is required'),
    body('phone').trim().isLength({ max: 20 }),
    body('email').trim().isEmail().withMessage('Valid email is required'),
], asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    const { project_id, student_name, phone, email, action } = req.body;

    if (!errors.isEmpty()) {
        return res.status(400).render("addgroup", { project_id, errors: errors.array(), activePage: 'projects' });
    }

    const studentID = uuidv4();
    const sql = `
        INSERT INTO student_detail (student_id, project_id, student_name, phone, email)
        VALUES (?, ?, ?, ?, ?)
    `;

    await pool.execute(sql, [studentID, project_id, student_name, phone, email]);

    if (action === "add_more") {
        return res.redirect(`/projects/new/group/${project_id}`);
    }
    return res.redirect(`/projects/new/addpaymentstatus/${project_id}`);
}));


app.get("/projects/new/addpaymentstatus/:projectId", isAuthenticated, (req, res) => {
    res.render("addpaymentstatus", { project_id: req.params.projectId, activePage: 'projects' });
});

app.post("/projects/new/addpaymentstatus/:projectId", isAuthenticated, [
    body('first_installment').isNumeric(),
    body('second_installment').isNumeric(),
    body('total').isNumeric(),
], asyncHandler(async (req, res) => {
    const { project_id, first_installment, second_installment, total } = req.body;

    const first = parseFloat(first_installment) || 0;
    const second = parseFloat(second_installment) || 0;
    const totalFees = parseFloat(total) || 0;
    const paid = first + second;
    const remaining = totalFees - paid;

    const paymentID = uuidv4();
    const paymentQuery = `
        INSERT INTO payment_status 
        (payment_id, project_id, first_installment, second_installment, total, paid, remaining)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            first_installment = VALUES(first_installment),
            second_installment = VALUES(second_installment),
            total = VALUES(total),
            paid = VALUES(paid),
            remaining = VALUES(remaining)
    `;

    await pool.execute(paymentQuery, [paymentID, project_id, first, second, totalFees, paid, remaining]);

    const expenseID = uuidv4();
    const expenseQuery = `
        INSERT INTO expense (expense_id, project_id, fees, expense_amount, details)
        VALUES (?, ?, ?, 0, 'No Expense Added Yet')
        ON DUPLICATE KEY UPDATE
            fees = VALUES(fees),
            details = VALUES(details)
    `;

    await pool.execute(expenseQuery, [expenseID, project_id, totalFees]);
    res.redirect(`/projects/${project_id}/details`);
}));



// Delete Project

app.delete("/projects/:id", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    const [result] = await pool.execute("DELETE FROM projects WHERE project_id = ?", [projectId]);
    
    if (result.affectedRows === 0) {
        return res.json({ success: false, message: "Project not found" });
    }
    res.json({ success: true });
}));


// Edit ROUTE

app.get("/projects/:id/edit", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    const [results] = await pool.execute("SELECT * FROM projects WHERE project_id = ?", [projectId]);

    if (results.length === 0) {
        return res.status(404).send("Project not found");
    }

    res.render("edit_project.ejs", { project: results[0], activePage: 'projects' });
}));

// Update Project Route

app.post("/projects/:id/edit", isAuthenticated, [
    body('project_name').trim().notEmpty().withMessage('Project name is required').isLength({ max: 150 }),
    body('college').trim().isLength({ max: 150 }),
    body('city').trim().isLength({ max: 100 }),
    body('project_status').isIn(['Pending', 'In Progress', 'Completed']),
], asyncHandler(async (req, res) => {
    const projectId = req.params.id;
    const { project_name, college, city, project_status, remark, deployment_date } = req.body;

    const sql = `
        UPDATE projects SET 
            project_name = ?, 
            college = ?, 
            city = ?, 
            project_status = ?, 
            remark = ?, 
            deployment_date = ?
        WHERE project_id = ?
    `;

    await pool.execute(sql, [project_name, college, city, project_status, remark, deployment_date || null, projectId]);
    res.redirect("/projects");
}));


// Delete student Rout

app.post("/student/:id/delete", isAuthenticated, asyncHandler(async (req, res) => {
    const studentId = req.params.id;
    const [result] = await pool.execute("DELETE FROM student_detail WHERE student_id = ?", [studentId]);
    return res.json({ success: result.affectedRows > 0 });
}));


// edit student route

app.get("/student/:id/edit", isAuthenticated, asyncHandler(async (req, res) => {
    const studentId = req.params.id;
    const [results] = await pool.execute("SELECT * FROM student_detail WHERE student_id = ?", [studentId]);

    if (results.length === 0) return res.status(404).send("Student not found");
    res.render("edit_student.ejs", { student: results[0], activePage: 'projects' });
}));


// update student route
app.post("/student/:id/update", isAuthenticated, [
    body('student_name').trim().notEmpty(),
    body('phone').trim(),
    body('email').trim().isEmail(),
], asyncHandler(async (req, res) => {
    const studentId = req.params.id;
    const { student_name, phone, email, project_id } = req.body;

    const query = `
        UPDATE student_detail
        SET student_name = ?, phone = ?, email = ?
        WHERE student_id = ?
    `;

    await pool.execute(query, [student_name, phone, email, studentId]);
    res.redirect(`/projects/${project_id}/details`);
}));

// Edit Payment Status Route

app.get("/payment/:id/edit", isAuthenticated, asyncHandler(async (req, res) => {
    const paymentId = req.params.id;
    const query = `
        SELECT ps.*, p.project_name, p.college 
        FROM payment_status ps
        JOIN projects p ON ps.project_id = p.project_id
        WHERE ps.payment_id = ?
    `;
    const [result] = await pool.execute(query, [paymentId]);
    if (result.length === 0) return res.status(404).send("Payment not found");
    res.render("edit_payment", { payment: result[0], activePage: 'projects' });
}));


// Update Payment Status Route

app.post("/payment/:id/update", isAuthenticated, [
    body('first_installment').isNumeric(),
    body('second_installment').isNumeric(),
    body('total').isNumeric(),
    body('paid').isNumeric(),
    body('remaining').isNumeric(),
], asyncHandler(async (req, res) => {
    const paymentId = req.params.id;
    const { first_installment, second_installment, total, paid, remaining, project_id } = req.body;

    const query = `
        UPDATE payment_status
        SET first_installment = ?, second_installment = ?, total = ?, paid = ?, remaining = ?
        WHERE payment_id = ?
    `;

    await pool.execute(query, [first_installment, second_installment, total, paid, remaining, paymentId]);
    res.redirect(`/projects/${project_id}/paymentStatus`);
}));


// add expense route

app.get("/projects/:projectId/expense/add", isAuthenticated, asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    const [result] = await pool.execute("SELECT * FROM projects WHERE project_id = ?", [projectId]);
    if (result.length === 0) return res.status(404).send("Project not found!");
    res.render("add_expense", { project: result[0], activePage: 'projects' });
}));

// insert expense route

app.post("/projects/:projectId/expense/add", isAuthenticated, [
    body('expense_amount').isNumeric(),
    body('details').trim().notEmpty(),
], asyncHandler(async (req, res) => {
    const projectId = req.params.projectId;
    const { details, expense_amount } = req.body;
    const expenseId = uuidv4();

    const q = `
        INSERT INTO expense (expense_id, project_id, fees, expense_amount, details)
        VALUES (?, ?, 0, ?, ?)
    `;

    await pool.execute(q, [expenseId, projectId, expense_amount, details]);
    res.redirect(`/projects/${projectId}/expense`);
}));



// DELETE route to remove expense
app.delete("/expense/:expenseId/delete", isAuthenticated, asyncHandler(async (req, res) => {
    const expenseId = req.params.expenseId;
    await pool.execute("DELETE FROM expense WHERE expense_id = ?", [expenseId]);
    res.json({ success: true });
}));



// Edit Expense Route

app.get("/expense/:expenseId/edit", isAuthenticated, asyncHandler(async (req, res) => {
    const expenseId = req.params.expenseId;
    const query = "SELECT e.*, p.project_name, p.college FROM expense e JOIN projects p ON e.project_id = p.project_id WHERE e.expense_id = ?";
    const [result] = await pool.execute(query, [expenseId]);
    if (result.length === 0) return res.status(404).send("Expense not found!");

    res.render("edit_expense", { expense: result[0], activePage: 'projects' });
}));

// Update Expense Route

app.post("/expense/:expenseId/edit", isAuthenticated, [
    body('expense_amount').isNumeric(),
    body('details').trim(),
], asyncHandler(async (req, res) => {
    const expenseId = req.params.expenseId;
    const { details, expense_amount, project_id } = req.body;

    const query = "UPDATE expense SET details = ?, expense_amount = ? WHERE expense_id = ?";
    await pool.execute(query, [details, expense_amount, expenseId]);
    res.redirect(`/projects/${project_id}/expense`);
}));



// add transactions

app.get("/transactions/add", isAuthenticated, (req, res) => {
    res.render("add_transaction", { activePage: 'transactions' });
});

app.post("/transactions/add", isAuthenticated, [
    body('credit_amount').optional({ checkFalsy: true }).isNumeric(),
    body('debit_amount').optional({ checkFalsy: true }).isNumeric(),
], asyncHandler(async (req, res) => {
    let { credit_amount, credit_desc, debit_amount, debit_desc } = req.body;
    const transactionId = uuidv4();

    const creditAmount = credit_amount ? parseFloat(credit_amount) : null;
    const creditDesc = credit_desc || null;
    const debitAmount = debit_amount ? parseFloat(debit_amount) : null;
    const debitDesc = debit_desc || null;

    const sql = `
        INSERT INTO transactions (transaction_id, credit_amount, credit_desc, debit_amount, debit_desc, transaction_date) 
        VALUES (?, ?, ?, ?, ?, CURDATE())
    `;

    await pool.execute(sql, [transactionId, creditAmount, creditDesc, debitAmount, debitDesc]);
    res.redirect("/transactions");
}));

// delete transaction route

// DELETE transaction
app.delete("/transactions/:id/delete", isAuthenticated, asyncHandler(async (req, res) => {
    const transactionId = req.params.id;
    await pool.execute("DELETE FROM transactions WHERE transaction_id = ?", [transactionId]);
    res.json({ success: true });
}));


// GET Edit Transaction Page
app.get("/transactions/:id/edit", isAuthenticated, asyncHandler(async (req, res) => {
    const transactionId = req.params.id;
    const [result] = await pool.execute("SELECT * FROM transactions WHERE transaction_id = ?", [transactionId]);
    if (result.length === 0) return res.status(404).send("Transaction not found");

    res.render("edit_transaction", { transaction: result[0], activePage: 'transactions' });
}));

// POST update transaction
app.post("/transactions/:id/update", isAuthenticated, [
    body('credit_amount').optional({ checkFalsy: true }).isNumeric(),
    body('debit_amount').optional({ checkFalsy: true }).isNumeric(),
], asyncHandler(async (req, res) => {
    const transactionId = req.params.id;
    const { credit_amount, credit_desc, debit_amount, debit_desc } = req.body;

    const sql = `
        UPDATE transactions
        SET credit_amount = ?, credit_desc = ?, debit_amount = ?, debit_desc = ?
        WHERE transaction_id = ?
    `;

    await pool.execute(sql, [credit_amount || null, credit_desc || null, debit_amount || null, debit_desc || null, transactionId]);
    res.redirect("/transactions");
}));





// ─────────────────────────────────────────────

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


// Global Error Handler (catches all async errors)
// ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('Global Error:', err.stack || err.message);

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }

    res.status(500).send(`
        <div style="font-family: sans-serif; padding: 40px; background: #111; color: #ff6b6b; min-height: 100vh;">
            <h2>Something went wrong</h2>
            <p>${process.env.NODE_ENV === 'production' ? 'An internal error occurred.' : err.message}</p>
            <a href="/" style="color: cyan;">Go Home</a>
        </div>
    `);
});

module.exports = app;
