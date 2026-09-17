import { createInsertSchema } from "drizzle-zod";
import {
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const suppliersTable = pgTable("urban_suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact"),
  platform: text("platform"),
  username: text("username"),
  url: text("url"),
  yupooCatalogUrl: text("yupoo_catalog_url"),
  notes: text("notes"),
  rating: doublePrecision("rating"),
  status: text("status").notNull().default("Active"),
  createdAt: createdAt(),
});

export const productsTable = pgTable("urban_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  sku: text("sku").notNull().unique(),
  imageUrl: text("image_url"),
  category: text("category").notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, {
    onDelete: "set null",
  }),
  platform: text("platform").notNull().default("Manual"),
  sourceUrl: text("source_url"),
  purchasePriceCny: doublePrecision("purchase_price_cny").notNull().default(0),
  domesticShippingBrl: doublePrecision("domestic_shipping_brl")
    .notNull()
    .default(0),
  costBrl: doublePrecision("cost_brl").notNull().default(0),
  weightGrams: doublePrecision("weight_grams").notNull().default(0),
  currentStock: integer("current_stock").notNull().default(0),
  reservedStock: integer("reserved_stock").notNull().default(0),
  inTransit: integer("in_transit").notNull().default(0),
  minimumStock: integer("minimum_stock").notNull().default(0),
  sellingPriceBrl: doublePrecision("selling_price_brl").notNull().default(0),
  marginPercent: doublePrecision("margin_percent").notNull().default(0),
  profitBrl: doublePrecision("profit_brl").notNull().default(0),
  status: text("status").notNull().default("Draft"),
  description: text("description"),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const ordersTable = pgTable("urban_orders", {
  id: serial("id").primaryKey(),
  orderCode: text("order_code").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, {
    onDelete: "set null",
  }),
  platform: text("platform").notNull(),
  cssbuyOrderId: text("cssbuy_order_id"),
  status: text("status").notNull().default("Draft"),
  currency: text("currency").notNull().default("CNY"),
  totalCny: doublePrecision("total_cny").notNull().default(0),
  itemCount: integer("item_count").notNull().default(0),
  orderedAt: createdAt(),
  notes: text("notes"),
});

export const importsTable = pgTable("urban_imports", {
  id: serial("id").primaryKey(),
  importCode: text("import_code").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, {
    onDelete: "set null",
  }),
  status: text("status").notNull().default("Research"),
  quantity: integer("quantity").notNull().default(0),
  productCostBrl: doublePrecision("product_cost_brl").notNull().default(0),
  domesticShippingBrl: doublePrecision("domestic_shipping_brl")
    .notNull()
    .default(0),
  cssbuyFeesBrl: doublePrecision("cssbuy_fees_brl").notNull().default(0),
  internationalShippingBrl: doublePrecision("international_shipping_brl")
    .notNull()
    .default(0),
  insuranceBrl: doublePrecision("insurance_brl").notNull().default(0),
  taxesBrl: doublePrecision("taxes_brl").notNull().default(0),
  packagingBrl: doublePrecision("packaging_brl").notNull().default(0),
  otherCostsBrl: doublePrecision("other_costs_brl").notNull().default(0),
  totalInvestmentBrl: doublePrecision("total_investment_brl")
    .notNull()
    .default(0),
  potentialRevenueBrl: doublePrecision("potential_revenue_brl")
    .notNull()
    .default(0),
  potentialProfitBrl: doublePrecision("potential_profit_brl")
    .notNull()
    .default(0),
  notes: text("notes"),
  createdAt: createdAt(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const shipmentsTable = pgTable("urban_shipments", {
  id: serial("id").primaryKey(),
  shipmentCode: text("shipment_code").notNull().unique(),
  importId: integer("import_id").references(() => importsTable.id, {
    onDelete: "set null",
  }),
  cssbuyParcelId: text("cssbuy_parcel_id"),
  trackingNumber: text("tracking_number"),
  carrier: text("carrier"),
  shippingMethod: text("shipping_method"),
  origin: text("origin"),
  destination: text("destination"),
  weightGrams: doublePrecision("weight_grams").notNull().default(0),
  shippingCostBrl: doublePrecision("shipping_cost_brl").notNull().default(0),
  insuranceBrl: doublePrecision("insurance_brl").notNull().default(0),
  status: text("status").notNull().default("Preparing"),
  eta: text("eta"),
  lastTrackingUpdate: timestamp("last_tracking_update", {
    withTimezone: true,
  }),
  notes: text("notes"),
  createdAt: createdAt(),
});

export const salesTable = pgTable("urban_sales", {
  id: serial("id").primaryKey(),
  saleCode: text("sale_code").notNull().unique(),
  productId: integer("product_id").references(() => productsTable.id, {
    onDelete: "set null",
  }),
  quantity: integer("quantity").notNull(),
  sellingPriceBrl: doublePrecision("selling_price_brl").notNull(),
  discountBrl: doublePrecision("discount_brl").notNull().default(0),
  revenueBrl: doublePrecision("revenue_brl").notNull().default(0),
  productCostBrl: doublePrecision("product_cost_brl").notNull().default(0),
  logisticsCostBrl: doublePrecision("logistics_cost_brl").notNull().default(0),
  realizedProfitBrl: doublePrecision("realized_profit_brl").notNull().default(0),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  soldAt: createdAt(),
});

export const expensesTable = pgTable("urban_expenses", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  amountBrl: doublePrecision("amount_brl").notNull(),
  description: text("description"),
  spentAt: timestamp("spent_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alertsTable = pgTable("urban_alerts", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: integer("is_read").notNull().default(0),
  createdAt: createdAt(),
});

export const activitiesTable = pgTable("urban_activities", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  description: text("description").notNull(),
  createdAt: createdAt(),
});

export const settingsTable = pgTable("urban_settings", {
  id: serial("id").primaryKey(),
  businessName: text("business_name").notNull().default("Urban Pair"),
  currency: text("currency").notNull().default("BRL"),
  timezone: text("timezone").notNull().default("America/New_York"),
  theme: text("theme").notNull().default("system"),
  defaultCountry: text("default_country").notNull().default("Brazil"),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({
  id: true,
  createdAt: true,
});
export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
});
export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
});
export const insertImportSchema = createInsertSchema(importsTable).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});
export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({
  id: true,
  createdAt: true,
});
export const insertSaleSchema = createInsertSchema(salesTable).omit({
  id: true,
  soldAt: true,
});
export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
});
export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
});

export type Supplier = typeof suppliersTable.$inferSelect;
export type Product = typeof productsTable.$inferSelect;
export type PurchaseOrder = typeof ordersTable.$inferSelect;
export type ImportRecord = typeof importsTable.$inferSelect;
export type Shipment = typeof shipmentsTable.$inferSelect;
export type Sale = typeof salesTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
export type Settings = typeof settingsTable.$inferSelect;
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;