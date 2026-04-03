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
    is_banned       BOOLEAN         NOT NULL DEFAULT FALSE,
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

CREATE TABLE IF NOT EXISTS anchors (
    anchor_id           CHAR(36)                                        PRIMARY KEY,
    creator_id          CHAR(36)                                        NOT NULL,
    title               VARCHAR(255)                                    NOT NULL,
    description         TEXT                                            NULL,
    location            POINT                                           NOT NULL SRID 4326,
    altitude            DOUBLE                                          NULL,
    status              ENUM('ACTIVE', 'EXPIRED', 'LOCKED', 'FLAGGED')  NOT NULL,
    visibility          ENUM('PUBLIC', 'PRIVATE', 'CIRCLE_ONLY')        NOT NULL,
    unlock_radius       INT                                             NOT NULL DEFAULT 50,
    max_unlock          INT                                             NULL,
    current_unlock      INT                                             NOT NULL DEFAULT 0,
    activation_time     DATETIME                                        NULL,
    expiration_time     DATETIME                                        NULL,
    tags                JSON                                            NULL,

    FOREIGN KEY (creator_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_anchors_creator_id (creator_id),
    SPATIAL INDEX idx_anchors_location (location)
);


CREATE TABLE IF NOT EXISTS Content (
    content_id          CHAR(36)                                        PRIMARY KEY,
    anchor_id           CHAR(36)                                        NOT NULL,
    content_type        ENUM('TEXT', 'FILE', 'LINK')                    NOT NULL,
    size_bytes          INT                                             NOT NULL,
    uploaded_at         DATETIME                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (anchor_id) REFERENCES anchors(anchor_id) ON DELETE CASCADE,
    INDEX idx_content_anchor_id (anchor_id)
);

create table if not exists text_content (
    content_id      CHAR(36)                                            primary key,
    text_body       TEXT                                                not null,
    language        varchar(50)                                         null,

    FOREIGN KEY (content_id) REFERENCES Content(content_id) ON DELETE CASCADE
);

create table if not exists media_content (
    content_id      CHAR(36)                                            primary key,
    file_url        varchar(2048)                                       not null,
    mime_type       varchar(255)                                        not null,
    file_name       varchar(255)                                        null,

    FOREIGN KEY (content_id) REFERENCES Content(content_id) ON delete cascade
);

create table if not exists link_content (
    content_id      char(36)                                            primary key,
    url             varchar(2048)                                       not null,
    preview_url     varchar(2048)                                       null,
    page_title      varchar(255)                                        null,

    foreign key (content_id) references Content(content_id) on delete cascade
);

CREATE TABLE IF NOT EXISTS reports (
    report_id       CHAR(36)                                                        PRIMARY KEY,
    anchor_id       CHAR(36)                                                        NOT NULL,
    reporter_id     CHAR(36)                                                        NOT NULL,
    reason          ENUM('SPAM', 'INAPPROPRIATE', 'HARASSMENT', 'MISINFORMATION', 'OTHER') NOT NULL,
    description     TEXT                                                            NULL,
    status          ENUM('PENDING', 'DISMISSED', 'ACTIONED')                       NOT NULL DEFAULT 'PENDING',
    created_at      DATETIME                                                        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at     DATETIME                                                        NULL,

    FOREIGN KEY (anchor_id) REFERENCES anchors(anchor_id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uq_report_per_user (anchor_id, reporter_id),
    INDEX idx_reports_anchor_id (anchor_id),
    INDEX idx_reports_status (status)
);

CREATE TABLE IF NOT EXISTS unlocked_anchors (
    user_id         CHAR(36)    NOT NULL,
    anchor_id       CHAR(36)    NOT NULL,
    unlocked_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (user_id, anchor_id),
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (anchor_id) REFERENCES anchors(anchor_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_logs (
    log_id          CHAR(36)        PRIMARY KEY,
    user_id         CHAR(36)        NOT NULL,
    action_type     VARCHAR(50)     NOT NULL,
    target_id       CHAR(36)        NULL,
    target_type     VARCHAR(50)     NULL,
    metadata        JSON            NULL,
    ip_address      VARCHAR(45)     NULL,
    timestamp       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_action (action_type)
);

-- ---------------------------------------------------------------------------
-- Seed data for local development
-- ---------------------------------------------------------------------------
-- Creator user used by seed anchors below.
INSERT IGNORE INTO users (
    user_id,
    email,
    password_hash,
    username
) VALUES (
    '11111111-1111-1111-1111-111111111111',
    'seed.user@anchor.dev',
    '$2b$12$seedplaceholderhashforlocaldevonly',
    'seed_user'
);

-- Two nearby, ACTIVE anchors with short tags for good list-card display.
INSERT IGNORE INTO anchors (
    anchor_id,
    creator_id,
    title,
    description,
    location,
    altitude,
    status,
    visibility,
    unlock_radius,
    max_unlock,
    current_unlock,
    activation_time,
    expiration_time,
    tags
) VALUES
(
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'Engineering Fountain Trivia',
    'Unlock to see today''s campus trivia prompt and hints.',
    ST_GeomFromText('POINT(-86.906414 40.422857)', 4326),
    NULL,
    'ACTIVE',
    'PUBLIC',
    120,
    200,
    14,
    DATE_SUB(NOW(), INTERVAL 2 HOUR),
    DATE_ADD(NOW(), INTERVAL 7 DAY),
    JSON_ARRAY('campus', 'trivia')
),
(
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'PMU Study Circle Notes',
    'Shared notes and quick links for this week''s study group.',
    ST_GeomFromText('POINT(-86.905780 40.423210)', 4326),
    NULL,
    'ACTIVE',
    'CIRCLE_ONLY',
    90,
    NULL,
    5,
    DATE_SUB(NOW(), INTERVAL 1 HOUR),
    DATE_ADD(NOW(), INTERVAL 5 DAY),
    JSON_ARRAY('study', 'notes')
);
