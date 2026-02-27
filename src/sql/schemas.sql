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