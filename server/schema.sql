CREATE DATABASE IF NOT EXISTS anchor_db;
USE anchor_db;

CREATE TABLE IF NOT EXISTS users (
    user_id         CHAR(36)        PRIMARY KEY,               
    email           VARCHAR(255)    UNIQUE NOT NULL,
    password_hash   VARCHAR(255)    NULL,                       
    username        VARCHAR(50)     UNIQUE NOT NULL,
    bio             TEXT            NULL,
    avatar_url      VARCHAR(2048)   NULL,
    is_ghost_mode   BOOLEAN         NOT NULL DEFAULT FALSE,
    is_admin        BOOLEAN         NOT NULL DEFAULT FALSE,
    oauth_provider  VARCHAR(50)     NULL,                       
    oauth_provider_id VARCHAR(255)  NULL,
    reset_token     VARCHAR(255)    NULL,                       
    reset_token_expiry DATETIME     NULL,
    last_login      DATETIME        NULL,
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_users_email (email),
    INDEX idx_users_username (username)
);

CREATE TABLE IF NOT EXISTS user_sessions (
    session_id      CHAR(36)        PRIMARY KEY,                
    user_id         CHAR(36)        NOT NULL,
    token           VARCHAR(512)    UNIQUE NOT NULL,            
    device_info     VARCHAR(255)    NULL,                       
    created_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at      DATETIME        NULL,
    revoked_at      DATETIME        NULL,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_sessions_user_id (user_id)
);