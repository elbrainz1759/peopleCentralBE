USE peopleCentral;

CREATE TABLE refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  refresh_token_hash VARCHAR(255) NOT NULL,
  user_agent TEXT NULL,
  ip_address VARCHAR(45) NULL,
  expires_at DATETIME NOT NULL,
  is_revoked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT fk_user_refresh
    FOREIGN KEY (user_id)
    REFERENCES users(unique_id)
    ON DELETE CASCADE
);

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  unique_id VARCHAR(255) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  role VARCHAR(100) NOT NULL,
  password VARCHAR(255) NULL,
  reset_token VARCHAR(255) NULL,
  reset_token_expiry DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE `employee` (
  `id` int NOT NULL AUTO_INCREMENT,
  `unique_id` varchar(255) NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `staff_id` int NOT NULL,
  `email` varchar(255) NOT NULL,
  `location` varchar(255) NOT NULL,
  `supervisor` varchar(255) NOT NULL,
  `program` varchar(255) NOT NULL,
  `created_by` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id` (`unique_id`),
  UNIQUE KEY `staff_id` (`staff_id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


CREATE TABLE `programs` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unique_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `fund_code` INT NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `name_index` (`name`)
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `departments` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unique_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `name_index` (`name`)
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `locations` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unique_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `name_index` (`name`)
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `leave_types` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unique_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
    `description` TEXT NOT NULL,
      `country` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `name_index` (`name`)
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `countries` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `unique_id` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `created_by` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `name_index` (`name`)
) ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_0900_ai_ci;



-- ─── Leaves ────────────────────────────────────────────────────────────────────
CREATE TABLE `leaves` (
  `id`               INT          NOT NULL AUTO_INCREMENT,
  `unique_id`        VARCHAR(255) NOT NULL,
  `staff_id`         INT          NOT NULL,
  `leave_type_id`    INT          NOT NULL,
  `reason`           TEXT         NOT NULL,
  `handover_note`    TEXT         NOT NULL,
  `total_hours`      DECIMAL(8,2) NOT NULL DEFAULT 0,
  `status`           ENUM('Pending','Reviewed','Approved','Rejected') NOT NULL DEFAULT 'Pending',
  `created_by`       VARCHAR(255) NOT NULL,
  `created_at`       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique` (`unique_id`),
  KEY `staff_id_index`      (`staff_id`),
  KEY `leave_type_id_index` (`leave_type_id`),
  KEY `status_index`        (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ─── Leave Durations ───────────────────────────────────────────────────────────
CREATE TABLE `leave_durations` (
  `id`         INT  NOT NULL AUTO_INCREMENT,
  `leave_id`   INT  NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date`   DATE NOT NULL,
  `hours`      DECIMAL(8,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `leave_id_index` (`leave_id`),
  CONSTRAINT `fk_leave_durations_leave` FOREIGN KEY (`leave_id`) REFERENCES `leaves` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ─── Leave Balances ────────────────────────────────────────────────────────────
CREATE TABLE `leave_balances` (
  `id`              INT          NOT NULL AUTO_INCREMENT,
  `unique_id`       VARCHAR(255) NOT NULL,
  `staff_id`        INT          NOT NULL,
  `leave_type_id`   INT          NOT NULL,
  `total_hours`     DECIMAL(8,2) NOT NULL DEFAULT 0,
  `used_hours`      DECIMAL(8,2) NOT NULL DEFAULT 0,
  `remaining_hours` DECIMAL(8,2) NOT NULL DEFAULT 0,
  `created_by`      VARCHAR(255) NOT NULL,
  `created_at`      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique`              (`unique_id`),
  UNIQUE KEY `staff_leave_type_unique`       (`staff_id`, `leave_type_id`),
  KEY `staff_id_index`                       (`staff_id`),
  KEY `leave_type_id_index`                  (`leave_type_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;


-- ─── Leave Balance Transactions ────────────────────────────────────────────────
CREATE TABLE `leave_balance_transactions` (
  `id`            INT          NOT NULL AUTO_INCREMENT,
  `unique_id`     VARCHAR(255) NOT NULL,
  `balance_id`    INT          NOT NULL,
  `staff_id`      INT          NOT NULL,
  `leave_type_id` INT          NOT NULL,
  `leave_id`      INT          NULL,
  `type`          ENUM('credit','debit','reversal') NOT NULL,
  `hours`         DECIMAL(8,2) NOT NULL,
  `note`          VARCHAR(255) NOT NULL,
  `created_by`    VARCHAR(255) NOT NULL,
  `created_at`    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_id_unique`    (`unique_id`),
  KEY `balance_id_index`           (`balance_id`),
  KEY `staff_id_index`             (`staff_id`),
  KEY `leave_id_index`             (`leave_id`),
  CONSTRAINT `fk_lbt_balance` FOREIGN KEY (`balance_id`) REFERENCES `leave_balances` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;