-- Drop existing tables in reverse order of dependencies
DROP TABLE IF EXISTS expense;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS payment_status;
DROP TABLE IF EXISTS student_detail;
DROP TABLE IF EXISTS projects;
DROP TABLE IF EXISTS admins;

-- 1. Admins Table
CREATE TABLE admins (
    admin_id VARCHAR(36) PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Projects Table
CREATE TABLE projects (
    project_id VARCHAR(36) PRIMARY KEY,
    project_name VARCHAR(150) NOT NULL,
    college VARCHAR(150),
    city VARCHAR(100),
    project_status ENUM('Pending', 'In Progress', 'Completed') DEFAULT 'Pending',
    remark TEXT,
    deployment_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX (project_name)
);

-- 3. Student Detail Table
CREATE TABLE student_detail (
    student_id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    student_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    INDEX (project_id)
);

-- 4. Payment Status Table
CREATE TABLE payment_status (
    payment_id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL UNIQUE,
    first_installment DECIMAL(12,2) DEFAULT 0.00,
    second_installment DECIMAL(12,2) DEFAULT 0.00,
    total DECIMAL(12,2) DEFAULT 0.00,
    paid DECIMAL(12,2) DEFAULT 0.00,
    remaining DECIMAL(12,2) DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
);

-- 5. Transactions Table
CREATE TABLE transactions (
    transaction_id VARCHAR(36) PRIMARY KEY,
    debit_desc VARCHAR(200),
    debit_amount DECIMAL(12,2) DEFAULT 0.00,
    credit_desc VARCHAR(200),
    credit_amount DECIMAL(12,2) DEFAULT 0.00,
    transaction_date DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Expense Table
CREATE TABLE expense (
    expense_id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) NOT NULL,
    fees DECIMAL(12,2) DEFAULT 0.00,
    expense_amount DECIMAL(12,2) DEFAULT 0.00,
    details VARCHAR(500),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
    INDEX (project_id)
);

-- Seed Initial Data with UUIDs
INSERT INTO projects (project_id, project_name, college, city, project_status, remark, deployment_date)
VALUES
('p1-uuid-0001', 'Student Management System', 'BJS College', 'Pune', 'Completed', 'Project delivered successfully', '2025-01-15'),
('p1-uuid-0002', 'Online Voting System', 'SPPU', 'Pune', 'In Progress', 'Development phase ongoing', NULL),
('p1-uuid-0003', 'Hospital Management System', 'MIT College', 'Mumbai', 'Pending', 'Waiting for approval', NULL);

INSERT INTO student_detail (student_id, project_id, student_name, phone, email)
VALUES
('s1-uuid-0001', 'p1-uuid-0001', 'Snehal Darade', '9876543210', 'snehal@gmail.com'),
('s1-uuid-0002', 'p1-uuid-0001', 'Amit Patil', '9876543222', 'amit@gmail.com'),
('s1-uuid-0003', 'p1-uuid-0002', 'Neha Sharma', '9123456789', 'neha@gmail.com');

INSERT INTO payment_status (payment_id, project_id, first_installment, second_installment, total, paid, remaining)
VALUES
('ps-uuid-0001', 'p1-uuid-0001', 5000, 5000, 10000, 10000, 0),
('ps-uuid-0002', 'p1-uuid-0002', 4000, 0, 10000, 4000, 6000);

-- Note: No admin password seeded here. Use seed_admin.js for that to ensure hashing.
