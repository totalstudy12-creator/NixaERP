-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Jul 29, 2026 at 07:09 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `raptore_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `advances`
--

CREATE TABLE `advances` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `advance_no` varchar(30) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `request_date` date NOT NULL,
  `payment_date` date DEFAULT NULL,
  `payment_method` enum('cash','bank_transfer','upi','cheque','other') DEFAULT NULL,
  `transaction_reference` varchar(255) DEFAULT NULL,
  `status` enum('draft','pending','approved','paid','completed','cancelled','rejected') NOT NULL DEFAULT 'pending',
  `approved_by` bigint(20) UNSIGNED DEFAULT NULL,
  `reason` text DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `attachment` varchar(255) DEFAULT NULL,
  `created_by` bigint(20) UNSIGNED DEFAULT NULL,
  `updated_by` bigint(20) UNSIGNED DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `advances`
--

INSERT INTO `advances` (`id`, `employee_id`, `advance_no`, `amount`, `request_date`, `payment_date`, `payment_method`, `transaction_reference`, `status`, `approved_by`, `reason`, `remarks`, `attachment`, `created_by`, `updated_by`, `deleted_at`, `created_at`, `updated_at`) VALUES
(3, 1, 'ADV-00001', 3000.00, '2026-07-16', '2026-07-16', 'cash', NULL, 'approved', NULL, 'dadi', NULL, NULL, 1, NULL, NULL, '2026-07-27 17:10:58', '2026-07-27 17:10:58');

-- --------------------------------------------------------

--
-- Table structure for table `attendances`
--

CREATE TABLE `attendances` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'present',
  `check_in` time DEFAULT NULL,
  `check_out` time DEFAULT NULL,
  `shift` varchar(255) NOT NULL DEFAULT 'General Shift (09:00 - 18:00)',
  `overtime` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `device` varchar(255) DEFAULT NULL,
  `location` varchar(255) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `attendances`
--

INSERT INTO `attendances` (`id`, `employee_id`, `date`, `status`, `check_in`, `check_out`, `shift`, `overtime`, `notes`, `device`, `location`, `created_at`, `updated_at`) VALUES
(2, 1, '2026-07-06', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:25:57', '2026-07-27 11:27:06'),
(3, 1, '2026-07-07', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:02', '2026-07-27 11:27:21'),
(4, 1, '2026-07-08', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:07', '2026-07-27 10:26:49'),
(5, 1, '2026-07-09', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:11', '2026-07-27 11:27:44'),
(6, 1, '2026-07-10', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:15', '2026-07-27 11:27:54'),
(7, 1, '2026-07-11', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:20', '2026-07-28 02:03:28'),
(8, 1, '2026-07-12', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:25', '2026-07-27 11:28:04'),
(9, 1, '2026-07-13', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:29', '2026-07-27 11:28:16'),
(10, 1, '2026-07-14', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:33', '2026-07-27 11:28:30'),
(11, 1, '2026-07-16', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:38', '2026-07-27 11:29:24'),
(12, 1, '2026-07-15', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:42', '2026-07-27 11:28:43'),
(13, 1, '2026-07-17', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:53', '2026-07-27 10:26:53'),
(14, 1, '2026-07-18', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:26:57', '2026-07-27 10:26:57'),
(15, 1, '2026-07-22', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:03', '2026-07-27 10:27:03'),
(16, 1, '2026-07-23', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:07', '2026-07-27 10:27:07'),
(17, 1, '2026-07-20', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:11', '2026-07-27 10:27:11'),
(18, 1, '2026-07-19', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:15', '2026-07-27 10:27:15'),
(19, 1, '2026-07-21', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:19', '2026-07-27 10:27:19'),
(20, 1, '2026-07-24', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:22', '2026-07-27 10:27:22'),
(21, 1, '2026-07-25', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:26', '2026-07-27 10:27:26'),
(22, 1, '2026-07-26', 'absent', NULL, NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-27 10:27:29', '2026-07-27 10:27:29'),
(25, 1, '2026-07-27', 'present', '09:00:00', '20:00:00', 'General Shift (09:00 - 18:00)', 0, NULL, 'TRIO DEVICE', 'Sikarpurrd', '2026-07-27 12:52:47', '2026-07-28 02:04:23'),
(27, 1, '2026-07-28', 'present', '09:00:00', '20:00:00', 'Office Hour', 0, NULL, NULL, NULL, '2026-07-29 04:07:32', '2026-07-29 04:18:49'),
(28, 1, '2026-07-29', 'present', '09:00:00', NULL, 'Office Hour', 0, NULL, NULL, NULL, '2026-07-29 04:17:25', '2026-07-29 04:19:01');

-- --------------------------------------------------------

--
-- Table structure for table `biometric_devices`
--

CREATE TABLE `biometric_devices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `device_uid` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `cpu` int(11) NOT NULL DEFAULT 0,
  `memory` int(11) NOT NULL DEFAULT 0,
  `flash` int(11) NOT NULL DEFAULT 0,
  `temperature` decimal(5,1) NOT NULL DEFAULT 0.0,
  `uptime` varchar(255) DEFAULT NULL,
  `signal` int(11) NOT NULL DEFAULT 0,
  `power` varchar(255) NOT NULL DEFAULT 'External',
  `wifi` varchar(255) NOT NULL DEFAULT 'Disconnected',
  `enrollment_status` varchar(255) DEFAULT NULL,
  `enrollment_employee_id` bigint(20) UNSIGNED DEFAULT NULL,
  `restart_count` int(11) NOT NULL DEFAULT 0,
  `last_restart_reason` varchar(255) DEFAULT NULL,
  `ip_address` varchar(255) DEFAULT NULL,
  `firmware_version` varchar(255) DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'offline',
  `last_sync_at` timestamp NULL DEFAULT NULL,
  `settings` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`settings`)),
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `biometric_devices`
--

INSERT INTO `biometric_devices` (`id`, `company_id`, `branch_id`, `device_uid`, `name`, `cpu`, `memory`, `flash`, `temperature`, `uptime`, `signal`, `power`, `wifi`, `enrollment_status`, `enrollment_employee_id`, `restart_count`, `last_restart_reason`, `ip_address`, `firmware_version`, `status`, `last_sync_at`, `settings`, `created_at`, `updated_at`) VALUES
(4, 1, 1, 'E0:72:A1:F2:6C:E4', 'TRIO DEVICE', 58, 71, 31, 36.1, '0d 1h 35m', -71, 'External', 'ok', NULL, NULL, 0, NULL, '192.168.1.150', '1.0.0', 'online', '2026-07-27 15:39:50', NULL, '2026-07-27 11:08:46', '2026-07-27 15:39:50');

-- --------------------------------------------------------

--
-- Table structure for table `biometric_scans`
--

CREATE TABLE `biometric_scans` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `biometric_device_id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED DEFAULT NULL,
  `scan_time` datetime NOT NULL,
  `scan_type` varchar(255) NOT NULL,
  `finger_index` smallint(5) UNSIGNED DEFAULT NULL,
  `result` varchar(255) NOT NULL DEFAULT 'success',
  `confidence` double DEFAULT NULL,
  `raw_data` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `branches`
--

CREATE TABLE `branches` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `branches`
--

INSERT INTO `branches` (`id`, `company_id`, `name`, `code`, `address`, `phone`, `email`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 'Sikarpurrd', 'B-1', 'Pawapuri more ,Nalanda ,Bihar', '7050248523', 'srisaibabatraders20@gmail.com', 1, '2026-07-27 10:24:00', '2026-07-27 10:24:00', NULL),
(2, 2, 'pawapuri', 'B-2', 'Pawapuri more ,Nalanda ,Bihar', '7050248523', 'srisaibabatraders20@gmail.com', 1, '2026-07-28 02:34:27', '2026-07-28 02:34:27', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `cache`
--

CREATE TABLE `cache` (
  `key` varchar(255) NOT NULL,
  `value` mediumtext NOT NULL,
  `expiration` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `cache_locks`
--

CREATE TABLE `cache_locks` (
  `key` varchar(255) NOT NULL,
  `owner` varchar(255) NOT NULL,
  `expiration` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `gst_number` varchar(255) DEFAULT NULL,
  `pan_number` varchar(255) DEFAULT NULL,
  `type` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `companies`
--

INSERT INTO `companies` (`id`, `name`, `code`, `email`, `gst_number`, `pan_number`, `type`, `phone`, `address`, `website`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 'BIPIN TENT BAZAR', 'M-1', 'srisaibabatraders20@gmail.com', NULL, NULL, NULL, '7050248523', 'Pawapuri more ,Nalanda ,Bihar', NULL, 1, '2026-07-27 10:23:33', '2026-07-27 10:23:33', NULL),
(2, 'RIYA ENTERPRISES', 'S-1', 'srisaibabatraders20@gmail.com', NULL, NULL, NULL, '7050248523', 'Pawapuri more ,Nalanda ,Bihar', NULL, 1, '2026-07-27 16:25:13', '2026-07-27 16:25:13', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `type` varchar(233) NOT NULL DEFAULT 'Customer',
  `phone` varchar(255) DEFAULT NULL,
  `gst_number` varchar(255) DEFAULT NULL,
  `billing_address` text DEFAULT NULL,
  `shipping_address` text DEFAULT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `customers`
--

INSERT INTO `customers` (`id`, `company_id`, `branch_id`, `name`, `email`, `type`, `phone`, `gst_number`, `billing_address`, `shipping_address`, `status`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'Aniket Raj', 'MR.ANIKETRAJ@GMAIL.COM', 'dealer', '36427381923', NULL, 'Sohsarai Opposite Sai Mandir', 'Bihar Sharif., Bihar, India', 'active', '2026-07-27 16:27:02', '2026-07-27 16:27:02', NULL),
(2, 1, 1, 'Sabnam DJ', NULL, 'customer', '12345678990', NULL, 'PokharPur', 'Pawapuri more', 'active', '2026-07-29 13:02:58', '2026-07-29 13:02:58', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `departments`
--

CREATE TABLE `departments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `designations`
--

CREATE TABLE `designations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `employees`
--

CREATE TABLE `employees` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `finger_id` bigint(20) UNSIGNED DEFAULT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `department_id` bigint(20) UNSIGNED DEFAULT NULL,
  `designation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `reporting_manager_id` bigint(20) UNSIGNED DEFAULT NULL,
  `employee_code` varchar(255) NOT NULL,
  `first_name` varchar(255) NOT NULL,
  `last_name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `gender` varchar(255) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `hire_date` date DEFAULT NULL,
  `salary` decimal(16,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `address` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `employment_type` varchar(255) DEFAULT NULL,
  `work_location` varchar(255) DEFAULT NULL,
  `salary_type` varchar(255) DEFAULT NULL,
  `ctc` decimal(10,2) NOT NULL DEFAULT 0.00,
  `gross` decimal(10,2) NOT NULL DEFAULT 0.00,
  `basic` decimal(10,2) NOT NULL DEFAULT 0.00,
  `hra` decimal(10,2) NOT NULL DEFAULT 0.00,
  `da` decimal(10,2) NOT NULL DEFAULT 0.00,
  `allowances` decimal(10,2) NOT NULL DEFAULT 0.00,
  `pf` decimal(10,2) NOT NULL DEFAULT 0.00,
  `esi` decimal(10,2) NOT NULL DEFAULT 0.00,
  `professional_tax` decimal(10,2) NOT NULL DEFAULT 0.00,
  `tds` decimal(10,2) NOT NULL DEFAULT 0.00,
  `bank_details` text DEFAULT NULL,
  `uan` varchar(255) DEFAULT NULL,
  `esic_number` varchar(255) DEFAULT NULL,
  `pending_biometric_scan` tinyint(1) NOT NULL DEFAULT 0,
  `manual_attendance_approval` tinyint(1) NOT NULL DEFAULT 0,
  `gps_attendance` tinyint(1) NOT NULL DEFAULT 0,
  `mobile_attendance` tinyint(1) NOT NULL DEFAULT 0,
  `web_attendance` tinyint(1) NOT NULL DEFAULT 0,
  `shift_attendance` tinyint(1) NOT NULL DEFAULT 0,
  `late_mark` tinyint(1) NOT NULL DEFAULT 0,
  `early_exit` tinyint(1) NOT NULL DEFAULT 0,
  `half_day` tinyint(1) NOT NULL DEFAULT 0,
  `overtime` tinyint(1) NOT NULL DEFAULT 0,
  `missed_punch` tinyint(1) NOT NULL DEFAULT 0,
  `attendance_correction_request` tinyint(1) NOT NULL DEFAULT 0,
  `emergency_contact` text DEFAULT NULL,
  `family_details` text DEFAULT NULL,
  `references` text DEFAULT NULL,
  `education` text DEFAULT NULL,
  `experience` text DEFAULT NULL,
  `skills` text DEFAULT NULL,
  `languages` text DEFAULT NULL,
  `blood_group` varchar(255) DEFAULT NULL,
  `marital_status` varchar(255) DEFAULT NULL,
  `passport` varchar(255) DEFAULT NULL,
  `driving_license` varchar(255) DEFAULT NULL,
  `aadhaar` varchar(255) DEFAULT NULL,
  `pan` varchar(255) DEFAULT NULL,
  `voter_id` varchar(255) DEFAULT NULL,
  `documents` text DEFAULT NULL,
  `document_expiry` date DEFAULT NULL,
  `joining_date` date DEFAULT NULL,
  `confirmation_date` date DEFAULT NULL,
  `promotion_date` date DEFAULT NULL,
  `transfer_date` date DEFAULT NULL,
  `increment_date` date DEFAULT NULL,
  `suspension_date` date DEFAULT NULL,
  `exit_date` date DEFAULT NULL,
  `full_final_settlement_date` date DEFAULT NULL,
  `shift_start_time` time DEFAULT NULL,
  `shift_end_time` time DEFAULT NULL,
  `grace_period_minutes` int(11) NOT NULL DEFAULT 10,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `overtime_rate` decimal(10,2) DEFAULT NULL,
  `daily_rate` decimal(10,2) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `employees`
--

INSERT INTO `employees` (`id`, `finger_id`, `company_id`, `branch_id`, `department_id`, `designation_id`, `reporting_manager_id`, `employee_code`, `first_name`, `last_name`, `email`, `phone`, `gender`, `date_of_birth`, `hire_date`, `salary`, `status`, `address`, `created_at`, `updated_at`, `deleted_at`, `employment_type`, `work_location`, `salary_type`, `ctc`, `gross`, `basic`, `hra`, `da`, `allowances`, `pf`, `esi`, `professional_tax`, `tds`, `bank_details`, `uan`, `esic_number`, `pending_biometric_scan`, `manual_attendance_approval`, `gps_attendance`, `mobile_attendance`, `web_attendance`, `shift_attendance`, `late_mark`, `early_exit`, `half_day`, `overtime`, `missed_punch`, `attendance_correction_request`, `emergency_contact`, `family_details`, `references`, `education`, `experience`, `skills`, `languages`, `blood_group`, `marital_status`, `passport`, `driving_license`, `aadhaar`, `pan`, `voter_id`, `documents`, `document_expiry`, `joining_date`, `confirmation_date`, `promotion_date`, `transfer_date`, `increment_date`, `suspension_date`, `exit_date`, `full_final_settlement_date`, `shift_start_time`, `shift_end_time`, `grace_period_minutes`, `hourly_rate`, `overtime_rate`, `daily_rate`) VALUES
(1, NULL, 1, 1, NULL, NULL, NULL, 'EMP-001', 'Suraj', 'kumar', 'surajkumar@gmail.com', '6206034461', 'Male', NULL, NULL, 5000.00, 'active', NULL, '2026-07-27 10:24:56', '2026-07-27 10:24:56', NULL, NULL, 'Sales', 'Monthly', 0.00, 0.00, 9000.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'B+', 'Single', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-05', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '09:00:00', '20:00:00', 10, NULL, NULL, NULL),
(2, NULL, 2, 2, NULL, NULL, NULL, 'EMP-002', 'test', 'kumar', 'surajkumare3@gmail.com', '6206034461', 'Male', NULL, NULL, 0.00, 'active', NULL, '2026-07-28 03:36:46', '2026-07-28 06:54:40', '2026-07-28 06:54:40', 'Permanent', NULL, NULL, 0.00, 0.00, 10000.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, NULL, NULL, NULL, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'B+', 'Married', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-07-01', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 10, NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `failed_jobs`
--

CREATE TABLE `failed_jobs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `uuid` varchar(255) NOT NULL,
  `connection` text NOT NULL,
  `queue` text NOT NULL,
  `payload` longtext NOT NULL,
  `exception` longtext NOT NULL,
  `failed_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fingerprint_templates`
--

CREATE TABLE `fingerprint_templates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `finger_index` smallint(5) UNSIGNED NOT NULL,
  `template_data` blob NOT NULL,
  `template_format` varchar(255) NOT NULL DEFAULT 'raw',
  `size_bytes` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoices`
--

CREATE TABLE `invoices` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED DEFAULT NULL,
  `invoice_no` varchar(255) NOT NULL,
  `total_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `due_date` timestamp NULL DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `invoices`
--

INSERT INTO `invoices` (`id`, `company_id`, `customer_id`, `order_id`, `invoice_no`, `total_amount`, `tax_amount`, `status`, `due_date`, `paid_at`, `notes`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, NULL, 'INV-143645', 5275.00, 0.00, 'paid', NULL, NULL, NULL, '2026-07-29 13:53:20', '2026-07-29 13:53:20', NULL),
(2, 1, 1, NULL, 'INV-317778', 460.00, 0.00, 'draft', NULL, NULL, NULL, '2026-07-29 14:13:00', '2026-07-29 14:13:00', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `invoice_items`
--

CREATE TABLE `invoice_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `invoice_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(16,2) NOT NULL,
  `tax_rate` decimal(8,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(16,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `jobs`
--

CREATE TABLE `jobs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `queue` varchar(255) NOT NULL,
  `payload` longtext NOT NULL,
  `attempts` tinyint(3) UNSIGNED NOT NULL,
  `reserved_at` int(10) UNSIGNED DEFAULT NULL,
  `available_at` int(10) UNSIGNED NOT NULL,
  `created_at` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `job_batches`
--

CREATE TABLE `job_batches` (
  `id` varchar(255) NOT NULL,
  `name` varchar(255) NOT NULL,
  `total_jobs` int(11) NOT NULL,
  `pending_jobs` int(11) NOT NULL,
  `failed_jobs` int(11) NOT NULL,
  `failed_job_ids` longtext NOT NULL,
  `options` mediumtext DEFAULT NULL,
  `cancelled_at` int(11) DEFAULT NULL,
  `created_at` int(11) NOT NULL,
  `finished_at` int(11) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `leaves`
--

CREATE TABLE `leaves` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `leave_requests`
--

CREATE TABLE `leave_requests` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `type` varchar(255) NOT NULL DEFAULT 'casual',
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loans`
--

CREATE TABLE `loans` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `loan_records`
--

CREATE TABLE `loan_records` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `installment_amount` decimal(12,2) NOT NULL DEFAULT 0.00,
  `installments` int(10) UNSIGNED NOT NULL DEFAULT 0,
  `status` varchar(255) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `loan_records`
--

INSERT INTO `loan_records` (`id`, `employee_id`, `amount`, `installment_amount`, `installments`, `status`, `notes`, `created_at`, `updated_at`) VALUES
(1, 1, 3000.00, 0.00, 0, 'active', NULL, NULL, NULL);

-- --------------------------------------------------------

--
-- Table structure for table `migrations`
--

CREATE TABLE `migrations` (
  `id` int(10) UNSIGNED NOT NULL,
  `migration` varchar(255) NOT NULL,
  `batch` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `migrations`
--

INSERT INTO `migrations` (`id`, `migration`, `batch`) VALUES
(1, '0001_01_01_000000_create_users_table', 1),
(2, '0001_01_01_000001_create_cache_table', 1),
(3, '0001_01_01_000002_create_jobs_table', 1),
(4, '0001_01_01_000003_create_business_core_tables', 1),
(5, '0001_01_01_000005_create_sales_invoicing_tables', 1),
(6, '0001_01_01_000006_create_employees_table', 1),
(7, '0001_01_01_000007_add_payment_bank_fields', 1),
(8, '2026_07_11_104254_update_employees_table', 1),
(9, '2026_07_12_000000_create_payrolls_table', 1),
(10, '2026_07_12_000001_create_settings_table', 1),
(11, '2026_07_12_181009_create_hr_payroll_tables', 1),
(12, '2026_07_15_104309_create_departments_table', 1),
(13, '2026_07_17_084636_create_designations_table', 1),
(14, '2026_07_22_120753_add_joining_date_to_employees_table', 1),
(15, '2026_07_22_131829_create_attendances_table', 1),
(16, '2026_07_22_132126_create_biometric_devices_table', 1),
(17, '2026_07_22_132127_create_biometric_scans_table', 1),
(18, '2026_07_22_132127_create_fingerprint_templates_table', 1),
(19, '2026_07_22_132128_create_offline_sync_queue_table', 1),
(20, '2026_07_23_063506_add_device_restart_fields', 1),
(21, '2026_07_23_075937_add_missing_columns_to_payrolls', 1),
(22, '2026_07_24_145019_add_missing_columns_to_payrolls_table', 1),
(23, '2026_07_25_120918_create_personal_access_tokens_table', 1),
(24, '2026_07_27_140620_create_roles_table', 1),
(25, '2026_07_27_140640_create_role_user_table', 1),
(26, '2026_07_27_194604_add_shift_fields_to_employees', 2),
(27, '2026_07_27_211521_create_leaves_table', 3),
(28, '2026_07_27_212453_create_shifts_table', 3),
(29, '2026_07_27_212505_create_loans_table', 3),
(30, '2026_07_27_212518_create_advances_table', 3),
(31, '2026_07_27_214324_add_advance_table', 4);

-- --------------------------------------------------------

--
-- Table structure for table `model_has_permissions`
--

CREATE TABLE `model_has_permissions` (
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `model_has_roles`
--

CREATE TABLE `model_has_roles` (
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `model_type` varchar(255) NOT NULL,
  `model_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `offline_sync_queue`
--

CREATE TABLE `offline_sync_queue` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `biometric_device_id` bigint(20) UNSIGNED NOT NULL,
  `payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`payload`)),
  `retry_count` tinyint(3) UNSIGNED NOT NULL DEFAULT 0,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `orders`
--

CREATE TABLE `orders` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `quotation_id` bigint(20) UNSIGNED DEFAULT NULL,
  `order_no` varchar(255) NOT NULL,
  `total_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `delivery_date` timestamp NULL DEFAULT NULL,
  `shipping_address` text DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `order_items`
--

CREATE TABLE `order_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `order_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` int(11) NOT NULL,
  `delivered` int(11) NOT NULL DEFAULT 0,
  `unit_price` decimal(16,2) NOT NULL,
  `tax_rate` decimal(8,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(16,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `email` varchar(255) NOT NULL,
  `token` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `invoice_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_method` varchar(255) NOT NULL,
  `reference_no` varchar(255) DEFAULT NULL,
  `amount` decimal(16,2) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `transaction_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `bank_name` varchar(255) DEFAULT NULL,
  `account_number` varchar(255) DEFAULT NULL,
  `ledger_reference` varchar(255) DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payrolls`
--

CREATE TABLE `payrolls` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `pay_period` varchar(255) NOT NULL,
  `basic` decimal(12,2) NOT NULL DEFAULT 0.00,
  `hra` decimal(12,2) NOT NULL DEFAULT 0.00,
  `da` decimal(12,2) NOT NULL DEFAULT 0.00,
  `allowances` decimal(12,2) NOT NULL DEFAULT 0.00,
  `incentives` decimal(12,2) NOT NULL DEFAULT 0.00,
  `overtime` decimal(12,2) NOT NULL DEFAULT 0.00,
  `festival_bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `performance_bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `other_bonus` decimal(12,2) NOT NULL DEFAULT 0.00,
  `gross` decimal(12,2) NOT NULL DEFAULT 0.00,
  `pf` decimal(12,2) NOT NULL DEFAULT 0.00,
  `esi` decimal(12,2) NOT NULL DEFAULT 0.00,
  `professional_tax` decimal(12,2) NOT NULL DEFAULT 0.00,
  `tds` decimal(12,2) NOT NULL DEFAULT 0.00,
  `loan_installment` decimal(12,2) NOT NULL DEFAULT 0.00,
  `advance` decimal(12,2) NOT NULL DEFAULT 0.00,
  `late_deduction` decimal(12,2) NOT NULL DEFAULT 0.00,
  `unpaid_leave_deduction` decimal(12,2) NOT NULL DEFAULT 0.00,
  `total_deductions` decimal(12,2) NOT NULL DEFAULT 0.00,
  `net_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `present` int(11) NOT NULL DEFAULT 0,
  `absent` int(11) NOT NULL DEFAULT 0,
  `leave` int(11) NOT NULL DEFAULT 0,
  `holiday` int(11) NOT NULL DEFAULT 0,
  `late` int(11) NOT NULL DEFAULT 0,
  `half_day` int(11) NOT NULL DEFAULT 0,
  `worked_days` int(11) NOT NULL DEFAULT 0,
  `worked_hours` int(11) NOT NULL DEFAULT 0,
  `overtime_hours` int(11) NOT NULL DEFAULT 0,
  `overtime_rate` decimal(10,2) DEFAULT NULL,
  `hourly_rate` decimal(10,2) DEFAULT NULL,
  `daily_rate` decimal(10,2) DEFAULT NULL,
  `attendance_breakdown` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`attendance_breakdown`)),
  `overtime_details` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`overtime_details`)),
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `payment_method` varchar(255) NOT NULL DEFAULT 'bank_transfer',
  `bank_details` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `loan_balance` decimal(12,2) NOT NULL DEFAULT 0.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `payrolls`
--

INSERT INTO `payrolls` (`id`, `employee_id`, `pay_period`, `basic`, `hra`, `da`, `allowances`, `incentives`, `overtime`, `festival_bonus`, `performance_bonus`, `other_bonus`, `gross`, `pf`, `esi`, `professional_tax`, `tds`, `loan_installment`, `advance`, `late_deduction`, `unpaid_leave_deduction`, `total_deductions`, `net_pay`, `present`, `absent`, `leave`, `holiday`, `late`, `half_day`, `worked_days`, `worked_hours`, `overtime_hours`, `overtime_rate`, `hourly_rate`, `daily_rate`, `attendance_breakdown`, `overtime_details`, `status`, `payment_method`, `bank_details`, `notes`, `created_at`, `updated_at`, `loan_balance`) VALUES
(23, 1, '2026-07', 3193.55, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 3193.55, 0.00, 0.00, 0.00, 0.00, 0.00, 3000.00, 0.00, 0.00, 3000.00, 193.55, 11, 11, 0, 0, 0, 0, 11, 0, 0, 54.44, 36.29, 290.32, '{\"2026-07-06\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-07\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-08\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-09\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-10\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-11\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-12\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-13\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-14\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-16\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-15\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-17\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-18\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-22\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-23\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-20\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-19\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-21\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-24\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-25\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-26\":{\"status\":\"absent\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0},\"2026-07-27\":{\"status\":\"present\",\"worked_seconds\":0,\"late_seconds\":0,\"overtime_seconds\":0}}', '[]', 'draft', 'bank_transfer', NULL, NULL, '2026-07-28 06:20:10', '2026-07-28 07:05:16', 0.00);

-- --------------------------------------------------------

--
-- Table structure for table `payslips`
--

CREATE TABLE `payslips` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `pay_period` varchar(255) NOT NULL,
  `net_pay` decimal(12,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'generated',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `group` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `permissions`
--

INSERT INTO `permissions` (`id`, `group`, `name`, `guard_name`, `created_at`, `updated_at`) VALUES
(1, NULL, 'view payroll', 'web', '2026-07-27 13:25:07', '2026-07-27 13:25:07'),
(2, NULL, 'create payroll', 'web', '2026-07-27 13:25:08', '2026-07-27 13:25:08'),
(3, NULL, 'edit payroll', 'web', '2026-07-27 13:25:08', '2026-07-27 13:25:08'),
(4, NULL, 'delete payroll', 'web', '2026-07-27 13:25:08', '2026-07-27 13:25:08'),
(5, NULL, 'run payroll', 'web', '2026-07-27 13:25:08', '2026-07-27 13:25:08');

-- --------------------------------------------------------

--
-- Table structure for table `personal_access_tokens`
--

CREATE TABLE `personal_access_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `tokenable_type` varchar(255) NOT NULL,
  `tokenable_id` bigint(20) UNSIGNED NOT NULL,
  `name` text NOT NULL,
  `token` varchar(64) NOT NULL,
  `abilities` text DEFAULT NULL,
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `personal_access_tokens`
--

INSERT INTO `personal_access_tokens` (`id`, `tokenable_type`, `tokenable_id`, `name`, `token`, `abilities`, `last_used_at`, `expires_at`, `created_at`, `updated_at`) VALUES
(1, 'App\\Models\\User', 1, 'auth-token', '9c1d13c1204577ea051462fe58e9c86f190c35de1b961decef4b663776b90386', '[\"*\"]', '2026-07-28 06:25:17', NULL, '2026-07-27 10:12:58', '2026-07-28 06:25:17'),
(2, 'App\\Models\\User', 1, 'auth-token', 'd9eb17171cc5e3153c8568dab86dfe6faa4cdd2cc321cf41042fc32637761a20', '[\"*\"]', '2026-07-27 10:55:20', NULL, '2026-07-27 10:18:15', '2026-07-27 10:55:20'),
(3, 'App\\Models\\User', 1, 'auth-token', '3c382a17e6924589ad958d60d8d5337e4c004165e713b3d608c3c49d40b99b22', '[\"*\"]', NULL, NULL, '2026-07-27 11:37:25', '2026-07-27 11:37:25'),
(4, 'App\\Models\\User', 1, 'auth-token', '0151f538d9c36cd98b46ef80560d1617d5abc4504238f23980c0d365676ab032', '[\"*\"]', '2026-07-27 13:55:26', NULL, '2026-07-27 13:08:16', '2026-07-27 13:55:26'),
(5, 'App\\Models\\User', 1, 'auth-token', '574a1b4c831da1c428aa704386ed2092c563ee57cf262b337d4d28feb864a6b2', '[\"*\"]', '2026-07-27 17:07:03', NULL, '2026-07-27 17:06:36', '2026-07-27 17:07:03'),
(6, 'App\\Models\\User', 1, 'auth-token', '0660262181b797aeb63e01ac3b476fea9d6009516df1cd3e840ff2bacf91264e', '[\"*\"]', NULL, NULL, '2026-07-28 04:27:19', '2026-07-28 04:27:19'),
(7, 'App\\Models\\User', 1, 'auth-token', 'e3e5a86d12b7d9e7f2e547210acfb33b497c8539df1cbddd6628218e2286021e', '[\"*\"]', '2026-07-28 04:42:53', NULL, '2026-07-28 04:30:50', '2026-07-28 04:42:53'),
(8, 'App\\Models\\User', 1, 'auth-token', '2b9bcf903d7414d2803d38100b9ac26baa6d6eedfc35916a6f56682828387db1', '[\"*\"]', NULL, NULL, '2026-07-28 06:53:52', '2026-07-28 06:53:52'),
(10, 'App\\Models\\User', 1, 'auth-token', '7453e325639228773cff5f00bc5ef538d0ad9c17fac0cf498af437cb27c3c3d5', '[\"*\"]', '2026-07-29 16:44:54', NULL, '2026-07-28 16:06:00', '2026-07-29 16:44:54'),
(11, 'App\\Models\\User', 1, 'auth-token', 'ef8f541c4dce8b7544dc1c5a7577f9259aa572fd0095edd81579c96e93f38ee9', '[\"*\"]', '2026-07-29 04:32:16', NULL, '2026-07-29 04:32:02', '2026-07-29 04:32:16'),
(13, 'App\\Models\\User', 1, 'auth-token', '4c56b23eb0130eafc2da1c2a3521d43fe40f84de4404390807e4bbf55a8af36e', '[\"*\"]', '2026-07-29 14:13:49', NULL, '2026-07-29 13:01:27', '2026-07-29 14:13:49'),
(14, 'App\\Models\\User', 1, 'auth-token', '6194219ab9a5ec23ee1b9e0208f0b7099b5f710143d9db6adeb8b5553d957aa9', '[\"*\"]', NULL, NULL, '2026-07-29 15:29:18', '2026-07-29 15:29:18'),
(15, 'App\\Models\\User', 1, 'auth-token', '3a9f57f11063f79553a5ed35d681993221d004cd8908bfa1066403648242b1bf', '[\"*\"]', NULL, NULL, '2026-07-29 15:57:48', '2026-07-29 15:57:48');

-- --------------------------------------------------------

--
-- Table structure for table `products`
--

CREATE TABLE `products` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `sku` varchar(255) NOT NULL,
  `barcode` varchar(255) DEFAULT NULL,
  `brand` varchar(255) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `purchase_price` decimal(16,2) NOT NULL DEFAULT 0.00,
  `sale_price` decimal(16,2) NOT NULL DEFAULT 0.00,
  `tax_rate` decimal(8,2) NOT NULL DEFAULT 0.00,
  `stock_quantity` int(11) NOT NULL DEFAULT 0,
  `reorder_level` int(11) NOT NULL DEFAULT 0,
  `description` text DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `products`
--

INSERT INTO `products` (`id`, `company_id`, `branch_id`, `name`, `sku`, `barcode`, `brand`, `unit`, `purchase_price`, `sale_price`, `tax_rate`, `stock_quantity`, `reorder_level`, `description`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'Dari 5*8', 'fu-1', NULL, NULL, 'pcs', 190.00, 230.00, 0.00, 150, 50, NULL, 1, '2026-07-28 02:37:29', '2026-07-28 02:37:55', NULL),
(2, 1, 1, 'Plain Japani CLoth', 'FB-10', NULL, NULL, 'MTR', 17.00, 18.00, 0.00, 100000, 5000, NULL, 1, '2026-07-29 13:08:56', '2026-07-29 13:08:56', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `quotations`
--

CREATE TABLE `quotations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` bigint(20) UNSIGNED NOT NULL,
  `reference_no` varchar(255) NOT NULL,
  `total_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(16,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'draft',
  `valid_till` timestamp NULL DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `quotation_items`
--

CREATE TABLE `quotation_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `quotation_id` bigint(20) UNSIGNED NOT NULL,
  `product_id` bigint(20) UNSIGNED NOT NULL,
  `quantity` int(11) NOT NULL,
  `unit_price` decimal(16,2) NOT NULL,
  `tax_rate` decimal(8,2) NOT NULL DEFAULT 0.00,
  `subtotal` decimal(16,2) NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `guard_name` varchar(255) NOT NULL DEFAULT 'web',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `roles`
--

INSERT INTO `roles` (`id`, `name`, `guard_name`, `created_at`, `updated_at`) VALUES
(1, 'Admin', 'web', '2026-07-27 10:11:06', '2026-07-27 10:11:06'),
(2, 'User', 'web', '2026-07-27 10:11:06', '2026-07-27 10:11:06');

-- --------------------------------------------------------

--
-- Table structure for table `role_has_permissions`
--

CREATE TABLE `role_has_permissions` (
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `role_permissions`
--

INSERT INTO `role_permissions` (`permission_id`, `role_id`) VALUES
(1, 1),
(2, 1),
(3, 1),
(4, 1),
(5, 1);

-- --------------------------------------------------------

--
-- Table structure for table `role_user`
--

CREATE TABLE `role_user` (
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `sessions`
--

CREATE TABLE `sessions` (
  `id` varchar(255) NOT NULL,
  `user_id` bigint(20) UNSIGNED DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload` longtext NOT NULL,
  `last_activity` int(11) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `sessions`
--

INSERT INTO `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`) VALUES
('1A0EN2ZhzuwfWXy0c8KdWDF8rH2G7WdKfkcIL5kQ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoia1B4aW1aWFNzS002ajBKNWQwWmxFa28yRGFHb09JNnBoa0tCUGdEVCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330605),
('1otbQAxkMlBjHXcBjbdcJ07LAHBdi7Y30NTNdRXK', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiTmdsOVV6NFowNmZ1MVQ2cTkzdUhrQWNoTlhoQUI0OFVVMnp3ZFd5WCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785340769),
('1wbCxg8O5IjC51Trg8JZtrwRrxQ7McujoObuSKhn', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiOE90Z2U5ZjNMczgzbjRiakpaV3REdWw3T0FUWEJaNXMxVVBJQUxnVSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336072),
('2b3O1Mr1n9SOxl7iE79lqaxwWSYgDxyEqbyNY1qB', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMEw0RGtOb01uc3hIeU44b1h1cHZnOFhIZ0JKREl1TDl1dHkyTW90byI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314310),
('3Kh1kD0LNAJidkRqJQotEYbeP3mEc85dZGCv4Qq7', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUlFhb3NWajRJc20xSWFCY2hMUzBEZUJzS2cweURHUE8wUG16WlBLdyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320049),
('4NTWYFQihn2roLi5jxt2dqqn0F4eLFqiiXMragpF', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUnp4Tllnd0tvS21lTmxRdzBoQnVCWnNlMW1iaXJ2UDdMT2ZtSVJFWCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330608),
('4qaDAt7aZk9J9BYVgsv5Mub5Z5U32wDFfmhUTtEg', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoid2ozbFV4MWg1UE1VS0duMkE1ZjJQc1ZmZWpLTlZ0enI5cVRXa0Q0TSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330622),
('55ElhVhhSkzpObuP5VNVTa7fGanOa0k2navEVLMR', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQklYR0xJbVE3NnY3ZU9aanprejZnMlVIejBiV1pkdGZHUmpPR2FkaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MzE6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9jb21wYW5pZXMiO3M6NToicm91dGUiO047fXM6NjoiX2ZsYXNoIjthOjI6e3M6Mzoib2xkIjthOjA6e31zOjM6Im5ldyI7YTowOnt9fX0=', 1785343493),
('595TLwpPxZcoHTdeQZQIosCRz1zqXZhliV20rL5s', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoibnp2R2pmQWZHYXlDcVJMR01iQWhocDFJMVN1VmpMYWtyZ1JyeE1xVCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330615),
('5HQR2OGOkt6VOBqRG1xW3xQNioLynGuwY2iOZihq', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiS1NKanN0U0tqbzhoeTBDQ0hoMlBEQ210YjV2TGdpNGdKc1dDNWZScCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330616),
('6bmrzHYwddMPXnxPLkLnA6by1qFTdGR7UoHbiKgY', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNlJWNG53QWV4eUFmcmxTelRQTGRYaW8yeUNXenlYdW9mV1dVVnBkbSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785329948),
('87Mo9n8Pl8wYe9ZSn5NVfc6NjEpmt8CsoqstDJO4', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZ05iOW84V3pQN3NIbjh3MWM5UjVjQ2RSYUNQVXdTdEp0Um05a3M3NiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785314296),
('8fyHqHchSwV4wK93VIG7ybENZxWXpAlLqsxj6bbg', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoid0pSYVZIeUo1R05OT1NQRUtjMFFyWEt2cDFYaW1HOTdHeGo2dmREMyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785329950),
('8HowPzj2bhjOloPwGDJUwpNA6cOM0cCGCx1Aqdn4', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.130.0 Chrome/148.0.7778.280 Electron/42.6.0 Safari/537.36', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQ1JWaXZZVllQUWtsQnpoNGtSQ3JzdDRraGJqdkN2ajRTVjNRdkFZMCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785335867),
('8iTwJZOhzL8MPzWu6VenvX4kyzPqVM3ekPN51Vbi', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoienlTeVBuUFdTVUl6N3h6VjR0c3VmdnpTbGtCNXdEd2t2NjVTeElVdSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314338),
('8o3KDcJEBkjBrmQ4eNGMxhbLWvO3Xy9LDxS4xYNv', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZ01EYUlOcXpZRll5T3VabDRxOUtwbmVNR3dBcG1LVDE5dW5mNDZTaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320067),
('9RIcIpiJhpieiArlOrKQwYD9wbP1pWQgmW6h9xYr', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiM3hBYkY1Qm14R0FQZmJST2ltWEwzbm91aVY0RWlwQU5qa1pZemdzVSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320066),
('9tBc0UxYqSsVb8WyfR5w7xuZqWrcFdjNtMSkD0FC', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoic3N1N1g5bEI0cFpGUWdic0Rick84eEs5RTA3c1BtZWRvR2N0elZQMiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314295),
('a384XS5tbrSlyR561aaBikyn2j9go8Tx59PjaQ8h', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiTXoyaUlZQ1hCYWNSZ2ZIaU9jNDNkYlVSY2FnM1lYcVRveGl6amhYbyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330625),
('AX1tZ2pqZDzVQhvNSHNn45uJsRMPeaxjq13FbH5v', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSDhVdnI4UnU0YzFsRWVnSG4xVDBNYWNiemxKZVR2c0dWbkIwUWVvWCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314313),
('BfvuqaFXGCGE7mgYMwLBDGvEn0ZTVH5sdTIM1yg0', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiVUNBWVlPTEJVY3pBbUEzaW1tb2RFMkU0b0hQRHRNajRMR01ZMTZQRiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330611),
('bXj9aQdavOEPXhg63m0N5gbb0b1h1uoNN4KYN2qE', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMURRelJjN1ZmUno0NUVINVFXNk95V0RrZHdTVnRaNFd0SWwwaGFZRCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785340765),
('ccJZS8jwGcGGXDQ0HRQrMOozsKXncvtWAc4Oe5EC', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiV1JGblRvbjlwQ0RWcWN5ZnhZVDQ2Q1VleG9KUkNKZUJIWUVWcEFieiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785319882),
('ccuOVe91aF2fJF2AbBVjmzQf0BLVUxAcbEuyvqkz', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiOUxWUUpNV3UxeHV6bVhYc0Z5Mnh3ZGVkUGVpYkVuTkQzSnZyZWFkVSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785329952),
('CfeF1tTsVvWDviulF7LLu4PocpbVwR9hxKKMO2OY', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiY2dyeUhCa01hc3JmVk9BanR4eHBTZFNBMkR6bGxIRUl4SElvQzdwTSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320205),
('cgSIJYmItk3E7ktUN5ORVSaCSLyDErJtva2z62Tr', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMWQzTWpnTDZxSkRMTXQyZVZ4TXpQVUJDRWRoVVlGSDhJN2JxMkx0MCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314289),
('cjr6goSQklS25soI3QAq9coIQXdETKoIAyEvunVF', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicWVkMDZWWEt2QzBXelRvRncwbFkwNXk0Z2pxdllNbmx0ODEwS0pQaCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320185),
('cksna04Z0ze76nnE4dECr37wbXhhNOrf6dRSq0p0', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSGNUWThCeTNTTDIxaUxGMkdjdzYyQzdPazdPc1JqMEY1SDE4NnJ5eSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785319880),
('CQJ0CIkqwnQmPb8KftNgaPW9nZvgsmar4D9Ez1EZ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZmtLZ1Y1a1l3dUNBSnB2THNNenp6VnVQUE1vb2dRZmdIbDhDeUhyaiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320202),
('cRD1J6ZA5nXTGj8DPllt3Hz2ldQ9PFVS0eNdrPAW', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiOFV4MDJxb2VmZFdqTmhsS1hTWGRnbFJaM0U1UFBFckFUT082YjJraCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320062),
('DLIHwOvS5rm6dTEUWalkudkoiwIW3GSpl5xoxaJ3', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQ0tCOFE3WU9jMEVoZmFxQWN3Nnhpa2drSkFQallLUHdwVWxuVDkzZiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320176),
('dlv2U9phGhfc7twznetJGy7f0Ye1o4kV9KcAlzmk', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiekNsUFJpeHF4ZVJ1WWp6b00wR251aG8ySHVzZk02RUozYTBqOUNaTyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320197),
('DttHIgrLaSsWVAc04WRvLq1AqAcL3GZ3FnxDc1pY', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoidG1SbHNTYjVUUnhmZVV0WlJPUHRtU3I0anU4SmxMeTQzVEllc1FzUSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330624),
('E6aeydlijZrsqHuU2j88oE95mDkE5OkkXckdLq6R', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicUpYWnFES3BTMjdUaVpKZTU0M2NNUDFWUVBFTTVqd2d1TG5YcUJnbyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320187),
('EK6e2IDTvdXWtZxMcXa1Falgx3qhMGyXplSFXcaa', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZ1NmZE9PWURMTWhJeENHaVVPUmkyQThOcXg2N2M1WTBvY1Z4aFNtcyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785336058),
('FB8bWw42tb5D0YqxrCsk5dIavS2yxBJr42weJ24Q', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiS3RVMUdQb0JvQ2xNUGVkV1lNTVZBODA3YUx1RlZzWXc1V0hIajZnTSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785307801),
('fbVY8urNxxZOF0fAkbbOBzsyVL9mpTyttJ8eEdVe', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoidWdxSFV3NlJIVFFaY0toYW9ackhrcWtpc045OE5wNnJ6bk55Z290SSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320054),
('FG0yPosweIBvTuwEd0LlT8kufXsihnI4IdhkLSOU', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZ21iRHdOTVJpbW1xaXJRdVRqZXhCa1FEZEViUFNzZXlXMEdlYWxtaiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320151),
('G7N31vv91gN91ggP7oea3sJIBOdyGZMWvELSTNfo', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiRWt3eFhMU1JFaHZTdGJOUTRXekxUSW82UTQ3Mkl5eHRKVlJCMWN1ZiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785329950),
('gaFI1EHEzuxNHG7ZQLYCHDQnXWiZhFJ7zg4D8sA1', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoidDVOQzB3WGNDaU9FYXA0RnIyVUs0bE8yd1UxcnVmR3dVa2xWR3BEeCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320050),
('GeggHaG6pH9tVrYwGDIf5BemJ7VQKgZbkxpItYJq', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNndhekdDQUxZNHR5dnkyTXBJVEo5WVJjek1pOVVQakJ0ckVhOFQwMCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785307799),
('geYBE15NPF2un2W5nSRAxJFlsWgYiJxFhKeOMNwK', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieXowMTVBUmlXRmdpODByUXBWOVA5UE5KOXM5MG1PZktOSW5DM2dUUiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314341),
('gfEJigbfvmSlbjehVAKC2h8HJzuDUhnBAVrIwJhP', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiWUc1QWNqRFhKek1xTGhXU0VkN0pnMVppdThnSFM2bnFjQnZnMThvciI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785314290),
('Gg9vTBT2oHNUC2JKHkqaFbTQJai2ukpTVvnYVWue', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUmZEclp5cFo5TlVPYlNhamRaUHBVVEJXQVN0NXg3bzZ6RnJkRHEyQiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320193),
('GjcxIIv1WCMx4MPLRJGkPN18x09LCMFyWlMR6EH3', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNUllMWpTcWw4TVdYcHk4MVZjZVlTck1vOXpVWHZ4UnZwUWZHclFOaCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320176),
('gKVDOsI1Jkn4y5hyIcuM5us8LhLTsspJCc68JM0Y', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicU5kemNlelMwckJ0QUZrNnc5VFRRdnkxMDNZSmZDd3gxUVBGQjFrZCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314344),
('GqTknwPi0hH6kK3mSc6disjowEl9no2vC1AmV9WW', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQzRIR0NScWtaOHhScGdRTUxXOGZhNmF6YldMYzh3ZFlFZmZVRUNBbyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320158),
('GsxuBbCTIOeQStFGpNUnHn17Fj71CWSrnloZX48E', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoia3lRUXdqTEJpNnMyaFNIdEhzeENvRllGVWtTUVFhbTZISXdqY1ZYcyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314336),
('hBEnQjTIBjcFwFv4J2UgX80pBPxLCPhLb4lZaRAz', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUExuV1p6c3pmMVdmTDZieGM4VEdROWNNblppTWpPRm9nbXkwdUlFTSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330619),
('HeKsWD4HJ9afOpOUdOQpaz30ObJldaZGN8Oe8aL8', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicGxsbHhrQ1hUNkE1MkRrWlRrV1NVSWlQdEJxckxmS2c1WjBhSFlPbCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785335884),
('HJ7s7ydpZuvqxOupv9wVknMiNnbCLceLtkr0Ccd2', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUjBXb3A5OGJxbEliTGhvdUdOWUdZaW1oNTdzU2pUQXhZTHFSUnI4eCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314340),
('HM9DQidbnzjo5pUhkMZYFV2cPfRsOnO9j95fOeAt', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicWlQSWVnUHk3bk1pUnBoWHpWZFlHRzE0MUVnaDRRbm1ERkxiQVlKdCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336075),
('hMrDkkoGPzC8q6rCMmfuQzwFzzHrsUKzgmOXs2VQ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMGtnN1JUOU5nT3JzRlIwdG9WdnZQdFVHczdXOWdGbjAySUZ3NXkxVyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319882),
('HRA8MEYbIwjSS9mArFcpWlunZBxeFrZS0FwVfWav', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiY2NoTnR2UWw0QVJWRzRTZlY1WGtseG05M3J5cWJhczVqNVRxalRyeCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320182),
('i3sSlhFmOaFHIjypVkng377BKrltQaNSobYOn44g', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMzRORTN6bVZLMzFKQTcyN3B6cUl5RnRTbFhrZUhUOGRCVXdXdlNnWSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785329943),
('icaWhPbZ7IodVWcUafunu2umPYNBb9yypZpjrK71', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiOERwVnN6NnU0eVNSeUZEc2ZrT3BCaEh2V2JxM0psMkVUNFMwNzdjSiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785319881),
('ImU07nZ24f2trKofgxtvypX8GkGyaAnzFMbKZIEs', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicnVMblpVZTNVTnBkRVhLN2Z2dGQ1TXA1NTRCU0JpQm5sUUdtVmNaUiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314308),
('iWpYVfaWFULiT8akWwsTkDDCEUKParbRmUZHQAnu', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieVM5aEgyMEU4NktXdWtTMkM4cW9pYmQ4UGhKM3VBVTNqbzNUNUI4cSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785307803),
('jh40Q1FQK1urQb4clExDLYy2bBvGJMWCUq4mak7d', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicG1GOGhmOVRHWUhYeUhqVWVtUTlIWFZSbzZodFpHdkpXU0VUd3d3ZyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320064),
('JqGWM1W3yWrPszDE5lVSGYvHWmTRZPX3C5dkLiNb', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiTW5Kdkc4N1lWbHNPcGFmalJUYlFqS3NESzNRWndVcmh6MTJpTDE0aCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785329942),
('k3g04jv1Q0yZqM9EqhsYmhD64ylRjNo4XCehMKYY', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoibmNtcFV0RDlZSmd1OVFiSEg0T2pGU25ldFZQRnZlQUc1UGFmZXNZNSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320058),
('kcXLZsssOGRpzmRb6dllNyOvkPZazfP0nNmpNTj5', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMW1Sek4weExFa3FBYmtTZXJBaFJlSmVsWUdMUTR3NEt3UlFHSzFpYSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785319875),
('KgWn8kPAalaOqZZSGzdkTkgOpGcRo5aaCfwNsvw9', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoidFlqSFpUemVWNXpNWFFFQVpvMGlqeXh4azhCZ0dNMk9VOW1OOEdmVCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785314282),
('LaRL06eQ3LwHhIftMAv6cf3gYiZs0bmucOI3YM0g', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNlk1NDZZWGdmWmRUTXVPNzFGNU1IZjVCUUF0ZFhOT3pBTGNtZUY1aiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319882),
('Lc3yZTuXDzozGhqONeL5Iw2w51OXbWVq6v3rVPlS', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiU2lFbnBKRkNVUWNrdXlCWmFJY1FNbmQycElxdEpob1N3WGk1TXNlUiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785314302),
('LEsLFpuBftK6YqQToaDZFi9Lc5VsSdDNxVJdoTyt', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieHJIRXk0UzBJcFFieWZSQ1BsNTZjZ3FobUJuRTNYQ3VxM2psZUNKciI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320057),
('M5SnXPPJ21FtUydzGbpb12lscOmXzots3PRR5rg0', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiREQ4Q3c0Qnhzd3R3cTE3S0FvREZaNUdCYlozT1IxcUhneVo0SU5CaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330622),
('m5zTKJyJx2ALePKJ3znHiEjTr8BTvuffW1dAkQJU', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicEY3NDRYMEFyUlZkMUVYN3VsTEJxUU00UUlTWk82bVZCbHRlY015TCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314343),
('MBC2vVpkGOXOv0tlHwY1qclAMED3jjRGe71bgj0d', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiT0NqQWo4dlZyaUliTjZLSUdkUE9pdFpEUGlJS016RDM5aUtjU25rYiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314318),
('mqfvWkEQRDCNOgqVo0KuFoAXMI3k3hEIHLrDAY9E', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSXdMTnFZdUlkNVhNTEpCb3N2OWMzc1c0NlVQQ25sSDZMdFpZN29waiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320068),
('MRRmDmPQXBGmlWjXUFMZ6www96WXmnyJpEq8A4f5', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNzFHTnByaVEyWnViWDFMbXNuVmhUNnFOSDF0dERaMTRFZFNsUWFETSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314281),
('N4hh5ZJjib96lJcpA1Eps2U9Y3pYCqXAnBNwXdlO', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMUgyOFFGc0J0dng0MnNqVng2SVFrSkJpd1FKbFpxN0pjdkVudlRseSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314332),
('NQ2Gq9JCANeV0v4S9ClbYYjWLas4o0zGmP9iNQLA', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiYXEzS2wxTHZHRU5ubnFPVmFHY0w1cnhtR3dwVU5CaDRjNWN5YVpQUSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320165),
('nS6l7G5IYbEUbWmoYTRQmNHtD0zHQJvMin7dGVO5', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiN0U3TVFmVmtmcGJ3REZYYTJRVVRybW9iQ1JqbDRyYWQzZ1M3cUZqQSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330619),
('pC9AaxGqkGT557bxTeSgCueIleSRKGkwJk2tOFIJ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiaDZ4SW0yYm1tYjRNdjFVclJTZ0ZjelNEMVI1Wnhnc2dHV0FBUVAxZCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319880),
('q4BCVyuC6UoAmER83zTB89kyolSYD3HR2K8ee94Z', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiU2xTQU4wZWlWTnJ5QmRQMWdUZ21kQTFNTmR2ckdKREdrSkUxQkZ4SSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320164),
('qjCSMN8B9UdYUW5RggHtXH32z9QHguMWIcF0T5Xf', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoid3o2VjVyZ0M5VTRmVUJCU0djVlpPcW02Rm5kSm1hTjAzd0ZGQ0pzSSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785340777),
('qt0cTXAPKZqliMAkeKyZlkiz2SSZAveKdDon3KkD', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieGpWUjVhUmlGM21MZERuaUlhc3AwSHMzamhOa0hHbEhuUUR0ZWdESSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320171),
('R02bXvFA8chLW6s6sV1r1S75fQDmXFdIl9pSCSUP', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNE05Y0syYWRJZ0lycDhCNlBER2Y4b1VJNjg1dndabFNtdUlHZ3hkdSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314334),
('RBNmmSmREmCGVVBhCjLnl0l9NjUjPzUVYKyxdEQJ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiWHQ4U1FxbTFMNDViaDlqYkFwTXpWbmZVdnFxN2Z4N3pzajUxM3dDSyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314301),
('rCvaBTW0alM0KMEoRl1qEDaPtTFQtxuA9u2PcoHT', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSnJhMzFSTDBpbThzRmpSWng3RkRRbmY0OUpGZzQyRHJ3cVJkd3ZQRyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320179),
('RNCya0opj3Pxz88sXw87SoO8ROJfQwo9aQPNLPWW', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMHFVVjhRcDltS3JjUzlxM2N3T0kwSUVCZnl1bEZnWlY5MERoa2RYNCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314327),
('rNv1vdqX8L4SCLSmXmH3LUUSHyuqi0VoPUvwUzTX', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicjR2R2ZJSmprQ0xTMWxpTkRaVE5IZ1EzWGlQMHNxWDlpNEdOMmNyNCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320204),
('rWJCQtmocXIfG1kzXmXO6gwIZnZZWqQWhfst6B1G', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZktneHZZMHp3eUJyeUt4Y3VZalRQdnNWaE00bXhYS0VQMnQ2R2Q2cSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320207),
('sa8W9ZkaVlELoH1VjurEUOOaoSQTZEN4VYBANFP2', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieFFOMFZzVDRaUXR1TUR1U05pWUpsM2l3NkQwVU9SQlUySW1UUFlwYyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320150),
('SCrNDsS1hDEuuDnnD4IH5ws18yqmytGuAsqvbosO', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiTGdzVEp2NXJsenZXWFNEbzUwMW9WNEdzdG1Md0FwZXhFNzBLVTJEMSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336062),
('sJSHaDHLL7cDALgqk7agkrrpZIE19qXNoVU3ekyX', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiWUJZVVVNRXlod0xNN21BWFlJMmRLT3VLMzRsejRuNW9VdE1FaXRYaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336078),
('sxIBq2TLOZFt3JgcEma9y6xl6hrCf1Bpizqw2GyM', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicHRSQml1bndlc2VRdGhuRXRXVGNKdTZybUNLM2xVcHVtTGptZ1B3SCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320064),
('T7cr2y94coFWJY5qrQCIozyTRt50i5SQ1Fqd7flS', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiRTdsc2RlOGNwQTlNSWhOMDZzMTFqR1hoRXZWc2hoblcwT2RxRzFIZSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785307800),
('tdG12WSjMFMBc98kWE36Ze2e1PmssLqA9r86MiHo', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNGdMT1dzY3RndGlCV09OZTdick45d1NlSlNHZVRHQkF6SWVYeFNLTSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320208),
('TiUyIQHKRms4yGZKTVveM13Lt6iaZPHrnoWpF2NQ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSVh1UXRnZ3VValh0QjlVMTRUWUt5aDFlV1V1TUU0NnlkeXdYMXhGaCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320192),
('trIzV5Hnwza2yuyQu0FcxTCEdUcnSx40jAgHw3Op', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMWFXdmdRYmRhQWFyU3RmRDNZdkVueks4UlM5WWFOc01hdmtqM3M0bSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314330),
('uAhuMCIrXET1GAfhDOLyH2QNXrW83RPQBgx2IgAF', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiaVNEVzZ5VGpmYmtybzh0NzV4RnN2S0dMdG5ObmpXb04wVEhVZXJzVCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785319878),
('UBonkgLSXyyVkAzRaHIClUy1OgTUNfVGO8KcssFI', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUjh5YmY3ZWc0M1A0TVlTVlZHSzk2TXBtWHpMNnI3S01mRE5yN2ZUciI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314315),
('uIPoWT1Gkc4mlu96tkNQzUn5E6HowxBH9wY9gNj5', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQmlSYTdrT05UVjFsMWpteWpOUGdIcUF1RzdRMzFWa2xIWWc1V1pMZiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314321),
('uMWcdUsPhlhupW2ZV0si2s9blcEOS7qyXmuMA9xZ', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoib3lGRG53SjVydGxTaDFpZ3Z2UkN1WThMQkJXSWVpcnRVTWpqRUMwNyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320048),
('uoKjcPyzD1jPxThW9q2qnYLJ2Y2TVrvPVMSPnruP', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiRk5kcmcxODZKdnVVVDRPV09QZW5qWDdjU2xCQ1NaSEZUTG9oa2g1VCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336068),
('UqSLIgXwWAQVdGlG72R1BTmqW3h1sU5uPHTLfKj3', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicU1NNHlVdnY0enVDRVRkcXVVaFFPdzdjVVo0cmw4ek80dmU1WkVydyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785314324),
('v5wFjLF70ScnKmNXOq5zuu91uvpMnLoK6uQEn4qc', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNWhiZEFqemdTWXI5WWgyVlNNTEZzSFdaMTF1YlA2WUlVT3A1eWtCaSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330604),
('v7yaQ73oqYNXCklhN6aAzLrgboEG4p0yX3eS3ZK6', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQWsycWdZaTVRcmk4TVFEbUhOUTNlMlh2NTFTbVhVT2ZSVjhibmw2diI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320171);
INSERT INTO `sessions` (`id`, `user_id`, `ip_address`, `user_agent`, `payload`, `last_activity`) VALUES
('vftYC3Lbfouksl7ouQf9AGxkayJraDi8sXfBIY78', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiU0pDOERPRm42bnVjeFZlMU1QblZQY3ZUa25mdTJpN2MzeTMzUjZHdyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330627),
('VG57qUJvxvviuytdCw7GYsbpxP0XUEK6VKgie0T7', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUkNuQ1lxOUdtYjBZTXJWV2hteEl6RHVCNW8zcWhGVHBJd0lra2ZTViI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785330607),
('VlITbkBpPAwSZPD9uHLAgdla6JfPrla7byYd6VSV', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoicmlYT1VjNGs3c0pBbFpYRXQ3TnVhSXY3bzNZMThGOFdDVHpTRFVjayI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785307799),
('wK8CxyazGcaeaHICMHczJfutOO4b4mYB2hUVOAN0', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiNDJTM0duMzc4b09PQlM0VzZwS0R0NVNVa0pKcDhhVWVmWFY5V0FmVyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336080),
('WnRJo14ZjC1z8zxBCcVnwDeAQ1u0TbETZJQNrRB1', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieW92N3NIWEp6bFpIRThpbXBTS3BVZ0RoSWdFVnNyZG5Pa1MxdUVwQiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MzI6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hdHRlbmRhbmNlIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785340763),
('WzFXjNXzVWIC6vaFemmqXadKMcPCVWWMf6Ts1ALY', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoieVBvdE5hd3NhYmxvbFBNdUhMMEZyeXl6NnV1NnRqcGNXcExJbzhNVCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319881),
('xPefuQl0bS9TGHZURsjutEjAixjnpA2u1rOt6Llv', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiMTRZT0lnWXA2UVJtY1EzZUlBT01JVWxJNER4UE5KeURwVmtXcWJJYyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320061),
('XsJtGPr6GCwFEH164actQVKbdMGhKYE2nCTQs273', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiM1I1eXNPaWNlRDZPVGZndHQwUVd2WGppUUlEM1daSzh3SnR6SkJJQiI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319879),
('XSuqkJpt0qn9X8E8eLDMd18NZjYwDdjerJCLlcu0', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiZWttdGdaT2ZtSTBOM3dabmhMaUpGNVdvQUNhbU5UbER1QndrZjJlaCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785329947),
('xSwJNW6CwHXUlOoaQlz9jnEOCChhbw55gijaw7gc', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiektjZDdYY25PMTY5aHppZnVBeElNYnQzUEJ3TWdzVllHS3VJYVJvZSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785336055),
('YdWvi5rtWjhyQU9sseOzwLbLMU4DY176YNk9qyM3', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUFBIODh5bE9uNlZZWENWWm9tRzBCY24zWmc5OWJ1aFJNUXdoNzhKcyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320200),
('YXhpEw5mLVsARywzXzs1YLWTO7ED6TQi0l98srbV', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiSER2QmtQaDM1OGYzNnJFbzh3NHFrVTY1c2pSY1d6MDd2SFZEbVRxeCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785307800),
('YYcblP7K21HrWsIUKe1e2trm7EEG5MyDnF1UtQ42', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiOEtTVWJNbmh2dDVzcmxJbktybzBCWUhtSHhRZmVmb2kxakNLVFBwcCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320054),
('YZpAHOUaPPduMmo693JNeRf7MhrtR6S42SECMHyo', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiQ21hOHBPMUNZUVN6WWd0Z1VScFV0ZXk3ZDBlQ0RKYVpoS2RsTHJpayI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785330611),
('zBn49ZV3stggwqxAaRWPPNLcyht9acnLkmfjDUwc', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoidmViZVdxOU5LQ1hrNlZ2VDNwQ3JSVXBrVllHaWpnWGQwY2c3T2owMCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDQ6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVwYXJ0bWVudHM/cGFnZT0xIjtzOjU6InJvdXRlIjtOO31zOjY6Il9mbGFzaCI7YToyOntzOjM6Im9sZCI7YTowOnt9czozOiJuZXciO2E6MDp7fX19', 1785320156),
('ZHffDox0Baza0JpLS8VsYbp6TcRG8LfbkjiX9iWn', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiS3BacnpHY1pOUHFCdVpBbVI0YW5hQlRXcGpmMnI2UVNHdDRacnhISSI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6MjE6Imh0dHA6Ly8xMjcuMC4wLjE6ODAwMCI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785338912),
('ZiB0f9VcXe0sU2W23a4FeJK7oq1zqclmlQHwLSTu', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiUWplbThicDZEaEZkSElxelNPNXF6SnV5ZE9nMnJUZ01lZUJ2SkFFYyI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785319876),
('ZMPqFeoye7TCB5KyKHql1N1qV8NoahARNVqmoH5B', NULL, '127.0.0.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36 Edg/150.0.0.0', 'YTozOntzOjY6Il90b2tlbiI7czo0MDoiR2NycE95cW13NG03eGNXS1A0ZUk3ZE9xRjVSYXo4anhCajA0aHNibCI7czo5OiJfcHJldmlvdXMiO2E6Mjp7czozOiJ1cmwiO3M6NDU6Imh0dHA6Ly9sb2NhbGhvc3Q6ODAwMC9hcGkvZGVzaWduYXRpb25zP3BhZ2U9MSI7czo1OiJyb3V0ZSI7Tjt9czo2OiJfZmxhc2giO2E6Mjp7czozOiJvbGQiO2E6MDp7fXM6MzoibmV3IjthOjA6e319fQ==', 1785320051);

-- --------------------------------------------------------

--
-- Table structure for table `settings`
--

CREATE TABLE `settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `key` varchar(255) NOT NULL,
  `value` text DEFAULT NULL,
  `group` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shifts`
--

CREATE TABLE `shifts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `shift_records`
--

CREATE TABLE `shift_records` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `employee_id` bigint(20) UNSIGNED NOT NULL,
  `date` date NOT NULL,
  `start_time` varchar(255) NOT NULL,
  `end_time` varchar(255) NOT NULL,
  `hours` decimal(5,2) NOT NULL DEFAULT 0.00,
  `status` varchar(255) NOT NULL DEFAULT 'pending',
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `email` varchar(255) NOT NULL,
  `email_verified_at` timestamp NULL DEFAULT NULL,
  `password` varchar(255) NOT NULL,
  `remember_token` varchar(100) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `name`, `email`, `email_verified_at`, `password`, `remember_token`, `created_at`, `updated_at`) VALUES
(1, 'Admin User', 'test@example.com', NULL, '$2y$12$3TmLqKfiajdiWV/wWpMRXunDy2C8KY6R3pmvCHkI4A3PRRj/K4Z6W', NULL, '2026-07-27 10:11:07', '2026-07-27 10:11:07');

-- --------------------------------------------------------

--
-- Table structure for table `user_roles`
--

CREATE TABLE `user_roles` (
  `user_id` bigint(20) UNSIGNED NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `user_roles`
--

INSERT INTO `user_roles` (`user_id`, `role_id`) VALUES
(1, 1);

-- --------------------------------------------------------

--
-- Table structure for table `warehouses`
--

CREATE TABLE `warehouses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` bigint(20) UNSIGNED NOT NULL,
  `branch_id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(255) NOT NULL,
  `code` varchar(255) DEFAULT NULL,
  `location` text DEFAULT NULL,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NULL DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Dumping data for table `warehouses`
--

INSERT INTO `warehouses` (`id`, `company_id`, `branch_id`, `name`, `code`, `location`, `active`, `created_at`, `updated_at`, `deleted_at`) VALUES
(1, 1, 1, 'Nanand Rd', 'W-1', 'Nanand Road', 1, '2026-07-28 02:35:50', '2026-07-28 02:35:50', NULL);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `advances`
--
ALTER TABLE `advances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `advances_advance_no_unique` (`advance_no`),
  ADD KEY `advances_approved_by_foreign` (`approved_by`),
  ADD KEY `advances_created_by_foreign` (`created_by`),
  ADD KEY `advances_updated_by_foreign` (`updated_by`),
  ADD KEY `advances_employee_id_index` (`employee_id`),
  ADD KEY `advances_advance_no_index` (`advance_no`),
  ADD KEY `advances_status_index` (`status`),
  ADD KEY `advances_request_date_index` (`request_date`),
  ADD KEY `advances_payment_date_index` (`payment_date`);

--
-- Indexes for table `attendances`
--
ALTER TABLE `attendances`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `attendances_employee_id_date_unique` (`employee_id`,`date`);

--
-- Indexes for table `biometric_devices`
--
ALTER TABLE `biometric_devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `biometric_devices_device_uid_unique` (`device_uid`),
  ADD KEY `biometric_devices_company_id_foreign` (`company_id`),
  ADD KEY `biometric_devices_branch_id_foreign` (`branch_id`);

--
-- Indexes for table `biometric_scans`
--
ALTER TABLE `biometric_scans`
  ADD PRIMARY KEY (`id`),
  ADD KEY `biometric_scans_biometric_device_id_foreign` (`biometric_device_id`),
  ADD KEY `biometric_scans_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `branches`
--
ALTER TABLE `branches`
  ADD PRIMARY KEY (`id`),
  ADD KEY `branches_company_id_foreign` (`company_id`);

--
-- Indexes for table `cache`
--
ALTER TABLE `cache`
  ADD PRIMARY KEY (`key`),
  ADD KEY `cache_expiration_index` (`expiration`);

--
-- Indexes for table `cache_locks`
--
ALTER TABLE `cache_locks`
  ADD PRIMARY KEY (`key`),
  ADD KEY `cache_locks_expiration_index` (`expiration`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `companies_code_unique` (`code`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customers_company_id_foreign` (`company_id`),
  ADD KEY `customers_branch_id_foreign` (`branch_id`);

--
-- Indexes for table `departments`
--
ALTER TABLE `departments`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `designations`
--
ALTER TABLE `designations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `employees`
--
ALTER TABLE `employees`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `employees_employee_code_unique` (`employee_code`),
  ADD UNIQUE KEY `employees_email_unique` (`email`),
  ADD UNIQUE KEY `employees_finger_id_unique` (`finger_id`),
  ADD KEY `employees_company_id_foreign` (`company_id`),
  ADD KEY `employees_branch_id_foreign` (`branch_id`);

--
-- Indexes for table `failed_jobs`
--
ALTER TABLE `failed_jobs`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `failed_jobs_uuid_unique` (`uuid`);

--
-- Indexes for table `fingerprint_templates`
--
ALTER TABLE `fingerprint_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `fingerprint_templates_employee_id_finger_index_unique` (`employee_id`,`finger_index`);

--
-- Indexes for table `invoices`
--
ALTER TABLE `invoices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `invoices_invoice_no_unique` (`invoice_no`),
  ADD KEY `invoices_company_id_foreign` (`company_id`),
  ADD KEY `invoices_customer_id_foreign` (`customer_id`),
  ADD KEY `invoices_order_id_foreign` (`order_id`);

--
-- Indexes for table `invoice_items`
--
ALTER TABLE `invoice_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `invoice_items_invoice_id_foreign` (`invoice_id`),
  ADD KEY `invoice_items_product_id_foreign` (`product_id`);

--
-- Indexes for table `jobs`
--
ALTER TABLE `jobs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `jobs_queue_index` (`queue`);

--
-- Indexes for table `job_batches`
--
ALTER TABLE `job_batches`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `leaves`
--
ALTER TABLE `leaves`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `leave_requests`
--
ALTER TABLE `leave_requests`
  ADD PRIMARY KEY (`id`),
  ADD KEY `leave_requests_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `loans`
--
ALTER TABLE `loans`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `loan_records`
--
ALTER TABLE `loan_records`
  ADD PRIMARY KEY (`id`),
  ADD KEY `loan_records_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `migrations`
--
ALTER TABLE `migrations`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `model_has_permissions`
--
ALTER TABLE `model_has_permissions`
  ADD PRIMARY KEY (`permission_id`,`model_id`,`model_type`),
  ADD KEY `model_has_permissions_model_id_model_type_index` (`model_id`,`model_type`);

--
-- Indexes for table `model_has_roles`
--
ALTER TABLE `model_has_roles`
  ADD PRIMARY KEY (`role_id`,`model_id`,`model_type`),
  ADD KEY `model_has_roles_model_id_model_type_index` (`model_id`,`model_type`);

--
-- Indexes for table `offline_sync_queue`
--
ALTER TABLE `offline_sync_queue`
  ADD PRIMARY KEY (`id`),
  ADD KEY `offline_sync_queue_biometric_device_id_foreign` (`biometric_device_id`);

--
-- Indexes for table `orders`
--
ALTER TABLE `orders`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `orders_order_no_unique` (`order_no`),
  ADD KEY `orders_company_id_foreign` (`company_id`),
  ADD KEY `orders_customer_id_foreign` (`customer_id`),
  ADD KEY `orders_quotation_id_foreign` (`quotation_id`);

--
-- Indexes for table `order_items`
--
ALTER TABLE `order_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `order_items_order_id_foreign` (`order_id`),
  ADD KEY `order_items_product_id_foreign` (`product_id`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`email`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `payments_company_id_foreign` (`company_id`),
  ADD KEY `payments_invoice_id_foreign` (`invoice_id`);

--
-- Indexes for table `payrolls`
--
ALTER TABLE `payrolls`
  ADD PRIMARY KEY (`id`),
  ADD KEY `payrolls_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `payslips`
--
ALTER TABLE `payslips`
  ADD PRIMARY KEY (`id`),
  ADD KEY `payslips_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `permissions_name_guard_name_unique` (`name`,`guard_name`);

--
-- Indexes for table `personal_access_tokens`
--
ALTER TABLE `personal_access_tokens`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `personal_access_tokens_token_unique` (`token`),
  ADD KEY `personal_access_tokens_tokenable_type_tokenable_id_index` (`tokenable_type`,`tokenable_id`),
  ADD KEY `personal_access_tokens_expires_at_index` (`expires_at`);

--
-- Indexes for table `products`
--
ALTER TABLE `products`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `products_sku_unique` (`sku`),
  ADD UNIQUE KEY `products_barcode_unique` (`barcode`),
  ADD KEY `products_company_id_foreign` (`company_id`),
  ADD KEY `products_branch_id_foreign` (`branch_id`);

--
-- Indexes for table `quotations`
--
ALTER TABLE `quotations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `quotations_reference_no_unique` (`reference_no`),
  ADD KEY `quotations_company_id_foreign` (`company_id`),
  ADD KEY `quotations_customer_id_foreign` (`customer_id`);

--
-- Indexes for table `quotation_items`
--
ALTER TABLE `quotation_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `quotation_items_quotation_id_foreign` (`quotation_id`),
  ADD KEY `quotation_items_product_id_foreign` (`product_id`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `roles_name_unique` (`name`);

--
-- Indexes for table `role_has_permissions`
--
ALTER TABLE `role_has_permissions`
  ADD PRIMARY KEY (`permission_id`,`role_id`),
  ADD KEY `role_has_permissions_role_id_foreign` (`role_id`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`permission_id`,`role_id`),
  ADD KEY `role_permissions_role_id_foreign` (`role_id`);

--
-- Indexes for table `role_user`
--
ALTER TABLE `role_user`
  ADD PRIMARY KEY (`user_id`,`role_id`),
  ADD KEY `role_user_role_id_foreign` (`role_id`);

--
-- Indexes for table `sessions`
--
ALTER TABLE `sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `sessions_user_id_index` (`user_id`),
  ADD KEY `sessions_last_activity_index` (`last_activity`);

--
-- Indexes for table `settings`
--
ALTER TABLE `settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `settings_key_unique` (`key`);

--
-- Indexes for table `shifts`
--
ALTER TABLE `shifts`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `shift_records`
--
ALTER TABLE `shift_records`
  ADD PRIMARY KEY (`id`),
  ADD KEY `shift_records_employee_id_foreign` (`employee_id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `users_email_unique` (`email`);

--
-- Indexes for table `user_roles`
--
ALTER TABLE `user_roles`
  ADD PRIMARY KEY (`user_id`,`role_id`),
  ADD KEY `user_roles_role_id_foreign` (`role_id`);

--
-- Indexes for table `warehouses`
--
ALTER TABLE `warehouses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `warehouses_company_id_foreign` (`company_id`),
  ADD KEY `warehouses_branch_id_foreign` (`branch_id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `advances`
--
ALTER TABLE `advances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `attendances`
--
ALTER TABLE `attendances`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=29;

--
-- AUTO_INCREMENT for table `biometric_devices`
--
ALTER TABLE `biometric_devices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=5;

--
-- AUTO_INCREMENT for table `biometric_scans`
--
ALTER TABLE `biometric_scans`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `branches`
--
ALTER TABLE `branches`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `companies`
--
ALTER TABLE `companies`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `customers`
--
ALTER TABLE `customers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `departments`
--
ALTER TABLE `departments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `designations`
--
ALTER TABLE `designations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `employees`
--
ALTER TABLE `employees`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `failed_jobs`
--
ALTER TABLE `failed_jobs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fingerprint_templates`
--
ALTER TABLE `fingerprint_templates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoices`
--
ALTER TABLE `invoices`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `invoice_items`
--
ALTER TABLE `invoice_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `jobs`
--
ALTER TABLE `jobs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `leaves`
--
ALTER TABLE `leaves`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `leave_requests`
--
ALTER TABLE `leave_requests`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loans`
--
ALTER TABLE `loans`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `loan_records`
--
ALTER TABLE `loan_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `migrations`
--
ALTER TABLE `migrations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=32;

--
-- AUTO_INCREMENT for table `offline_sync_queue`
--
ALTER TABLE `offline_sync_queue`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `orders`
--
ALTER TABLE `orders`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `order_items`
--
ALTER TABLE `order_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payments`
--
ALTER TABLE `payments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payrolls`
--
ALTER TABLE `payrolls`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=24;

--
-- AUTO_INCREMENT for table `payslips`
--
ALTER TABLE `payslips`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=6;

--
-- AUTO_INCREMENT for table `personal_access_tokens`
--
ALTER TABLE `personal_access_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=16;

--
-- AUTO_INCREMENT for table `products`
--
ALTER TABLE `products`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `quotations`
--
ALTER TABLE `quotations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `quotation_items`
--
ALTER TABLE `quotation_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=3;

--
-- AUTO_INCREMENT for table `settings`
--
ALTER TABLE `settings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shifts`
--
ALTER TABLE `shifts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `shift_records`
--
ALTER TABLE `shift_records`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `users`
--
ALTER TABLE `users`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `warehouses`
--
ALTER TABLE `warehouses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `advances`
--
ALTER TABLE `advances`
  ADD CONSTRAINT `advances_approved_by_foreign` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `advances_created_by_foreign` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `advances_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `advances_updated_by_foreign` FOREIGN KEY (`updated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `attendances`
--
ALTER TABLE `attendances`
  ADD CONSTRAINT `attendances_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `biometric_devices`
--
ALTER TABLE `biometric_devices`
  ADD CONSTRAINT `biometric_devices_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `biometric_devices_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `biometric_scans`
--
ALTER TABLE `biometric_scans`
  ADD CONSTRAINT `biometric_scans_biometric_device_id_foreign` FOREIGN KEY (`biometric_device_id`) REFERENCES `biometric_devices` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `biometric_scans_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `branches`
--
ALTER TABLE `branches`
  ADD CONSTRAINT `branches_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customers`
--
ALTER TABLE `customers`
  ADD CONSTRAINT `customers_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `customers_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `employees`
--
ALTER TABLE `employees`
  ADD CONSTRAINT `employees_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `employees_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `fingerprint_templates`
--
ALTER TABLE `fingerprint_templates`
  ADD CONSTRAINT `fingerprint_templates_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `invoices`
--
ALTER TABLE `invoices`
  ADD CONSTRAINT `invoices_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `invoices_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `invoices_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `invoice_items`
--
ALTER TABLE `invoice_items`
  ADD CONSTRAINT `invoice_items_invoice_id_foreign` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `invoice_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `leave_requests`
--
ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_requests_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `loan_records`
--
ALTER TABLE `loan_records`
  ADD CONSTRAINT `loan_records_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `model_has_permissions`
--
ALTER TABLE `model_has_permissions`
  ADD CONSTRAINT `model_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `model_has_roles`
--
ALTER TABLE `model_has_roles`
  ADD CONSTRAINT `model_has_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `offline_sync_queue`
--
ALTER TABLE `offline_sync_queue`
  ADD CONSTRAINT `offline_sync_queue_biometric_device_id_foreign` FOREIGN KEY (`biometric_device_id`) REFERENCES `biometric_devices` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `orders`
--
ALTER TABLE `orders`
  ADD CONSTRAINT `orders_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `orders_quotation_id_foreign` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `order_items`
--
ALTER TABLE `order_items`
  ADD CONSTRAINT `order_items_order_id_foreign` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `order_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `payments_invoice_id_foreign` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `payrolls`
--
ALTER TABLE `payrolls`
  ADD CONSTRAINT `payrolls_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payslips`
--
ALTER TABLE `payslips`
  ADD CONSTRAINT `payslips_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `products`
--
ALTER TABLE `products`
  ADD CONSTRAINT `products_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `products_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `quotations`
--
ALTER TABLE `quotations`
  ADD CONSTRAINT `quotations_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `quotations_customer_id_foreign` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `quotation_items`
--
ALTER TABLE `quotation_items`
  ADD CONSTRAINT `quotation_items_product_id_foreign` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `quotation_items_quotation_id_foreign` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `role_has_permissions`
--
ALTER TABLE `role_has_permissions`
  ADD CONSTRAINT `role_has_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_has_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `role_permissions_permission_id_foreign` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_permissions_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `role_user`
--
ALTER TABLE `role_user`
  ADD CONSTRAINT `role_user_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `role_user_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `shift_records`
--
ALTER TABLE `shift_records`
  ADD CONSTRAINT `shift_records_employee_id_foreign` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_roles`
--
ALTER TABLE `user_roles`
  ADD CONSTRAINT `user_roles_role_id_foreign` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `user_roles_user_id_foreign` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `warehouses`
--
ALTER TABLE `warehouses`
  ADD CONSTRAINT `warehouses_branch_id_foreign` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `warehouses_company_id_foreign` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
