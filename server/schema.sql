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

    FOREIGN KEY (content_id) REFERENCES Content(content_id) ON delete cascade
);

create table if not exists link_content (
    content_id      char(36)                                            primary key,
    url             varchar(2048)                                       not null,
    preview_url     varchar(2048)                                       null,
    page_title      varchar(255)                                        null,

    foreign key (content_id) references Content(content_id) on delete cascade
);
