-- AlterTable
ALTER TABLE `Booking` ADD COLUMN `deliveryFee` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `serviceFee` INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `PricingSetting` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `serviceFee` INTEGER NOT NULL DEFAULT 0,
    `deliveryFee` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
