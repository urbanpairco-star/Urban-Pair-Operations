import { getAuth } from "@clerk/express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter, type RequestHandler } from "express";
import {
  db,
  activitiesTable,
  alertsTable,
  expensesTable,
  importsTable,
  ordersTable,
  productsTable,
  salesTable,
  settingsTable,
  shipmentsTable,
  suppliersTable,
} from "@workspace/db";
import {
  CompleteImportParams,
  CreateExpenseBody,
  CreateImportBody,
  CreateOrderBody,
  CreateProductBody,
  CreateSaleBody,
  CreateShipmentBody,
  CreateSupplierBody,
  DeleteProductParams,
  DeleteSupplierParams,
  GetProductParams,
  GetSupplierParams,
  ListProductsQueryParams,
  MarkAlertReadParams,
  PreviewProductSourceBody,
  UpdateProductBody,
  UpdateProductParams,
  UpdateSettingsBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

export const requireAuth: RequestHandler = (req, res, next) => {
  const auth = getAuth(req);
  if (!auth.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
};

const asNumber = (value: unknown): number =>
  typeof value === "number" ? value : Number(value ?? 0);

const calculateProduct = (sellingPrice: number, cost: number) => {
  const profit = Math.max(0, sellingPrice - cost);
  return {
    profitBrl: profit,
    marginPercent: sellingPrice > 0 ? (profit / sellingPrice) * 100 : 0,
  };
};

const platformFromUrl = (url: string) => {
  const value = url.toLowerCase();
  if (value.includes("taobao") || value.includes("tmall")) return "Taobao";
  if (value.includes("goofish")) return "Goofish";
  if (value.includes("xianyu") || value.includes("闲鱼")) return "Xianyu";
  if (value.includes("1688")) return "1688";
  if (value.includes("weidian")) return "Weidian";
  if (value.includes("yupoo")) return "Yupoo";
  return "Marketplace";
};

const recordActivity = async (
  action: string,
  entity: string,
  description: string,
) => {
  await db.insert(activitiesTable).values({ action, entity, description });
};

const productResponse = async (product: typeof productsTable.$inferSelect) => {
  const supplier = product.supplierId
    ? (
        await db
          .select({ name: suppliersTable.name })
          .from(suppliersTable)
          .where(eq(suppliersTable.id, product.supplierId))
          .limit(1)
      )[0]
    : undefined;
  return {
    ...product,
    supplierName: supplier?.name ?? null,
  };
};

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [products, suppliers, orders, imports, shipments, sales, expenses] =
    await Promise.all([
      db.select().from(productsTable),
      db.select().from(suppliersTable),
      db.select().from(ordersTable),
      db.select().from(importsTable),
      db.select().from(shipmentsTable),
      db.select().from(salesTable),
      db.select().from(expensesTable),
    ]);

  const totalInvested = imports.reduce(
    (sum, item) => sum + asNumber(item.totalInvestmentBrl),
    0,
  );
  const inventoryCost = products.reduce(
    (sum, item) => sum + item.currentStock * asNumber(item.costBrl),
    0,
  );
  const inventoryValue = products.reduce(
    (sum, item) => sum + item.currentStock * asNumber(item.sellingPriceBrl),
    0,
  );
  const inTransitValue = products.reduce(
    (sum, item) => sum + item.inTransit * asNumber(item.costBrl),
    0,
  );
  const potentialRevenue = inventoryValue;
  const potentialProfit = products.reduce(
    (sum, item) => sum + item.currentStock * asNumber(item.profitBrl),
    0,
  );
  const currentRevenue = sales.reduce(
    (sum, item) => sum + asNumber(item.revenueBrl),
    0,
  );
  const realizedProfit = sales.reduce(
    (sum, item) => sum + asNumber(item.realizedProfitBrl),
    0,
  );
  const logisticsCost =
    shipments.reduce((sum, item) => sum + asNumber(item.shippingCostBrl), 0) +
    expenses
      .filter((item) => item.category.toLowerCase().includes("shipping"))
      .reduce((sum, item) => sum + asNumber(item.amountBrl), 0);

  res.json({
    totalInvested,
    inventoryValue,
    inventoryCost,
    inTransitValue,
    potentialRevenue,
    potentialProfit,
    currentRevenue,
    realizedProfit,
    logisticsCost,
    lowStock: products.filter((item) => item.currentStock <= item.minimumStock)
      .length,
    activeShipments: shipments.filter(
      (item) => !["Delivered", "Added to Inventory"].includes(item.status),
    ).length,
    products: products.length,
    suppliers: suppliers.length,
    orders: orders.length,
    revenueSeries: [],
    categorySeries: [],
  });
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const activities = await db
    .select()
    .from(activitiesTable)
    .orderBy(desc(activitiesTable.createdAt))
    .limit(8);
  res.json(activities);
});

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { search, page, pageSize } = parsed.data;
  const filters = search
    ? or(
        ilike(productsTable.name, `%${search}%`),
        ilike(productsTable.sku, `%${search}%`),
        ilike(productsTable.category, `%${search}%`),
      )
    : undefined;
  const rows = await db
    .select()
    .from(productsTable)
    .where(filters)
    .orderBy(desc(productsTable.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(productsTable)
    .where(filters);
  const items = await Promise.all(rows.map(productResponse));
  res.json({ items, total: Number(countRows[0]?.count ?? 0), page, pageSize });
});

router.post("/products", async (req, res): Promise<void> => {
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const calculated = calculateProduct(data.sellingPriceBrl, 0);
  const [product] = await db
    .insert(productsTable)
    .values({
      ...data,
      costBrl: 0,
      ...calculated,
      status: "Draft",
    })
    .returning();
  await recordActivity("Created", "Product", `Added ${product.name}`);
  res.status(201).json(await productResponse(product));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const product = (
    await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, parsed.data.id))
      .limit(1)
  )[0];
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(await productResponse(product));
});

router.patch("/products/:id", async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  const body = UpdateProductBody.safeParse(req.body);
  if (!params.success || !body.success) {
    const error = !params.success
      ? params.error.message
      : !body.success
        ? body.error.message
        : "Invalid product data";
    res.status(400).json({ error });
    return;
  }
  const current = (
    await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1)
  )[0];
  if (!current) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  const sellingPrice = body.data.sellingPriceBrl ?? current.sellingPriceBrl;
  const [product] = await db
    .update(productsTable)
    .set({
      ...body.data,
      costBrl: current.costBrl,
      ...calculateProduct(sellingPrice, current.costBrl),
    })
    .where(eq(productsTable.id, params.data.id))
    .returning();
  await recordActivity("Updated", "Product", `Updated ${product.name}`);
  res.json(await productResponse(product));
});

router.delete("/products/:id", async (req, res): Promise<void> => {
  const parsed = DeleteProductParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [deleted] = await db
    .delete(productsTable)
    .where(eq(productsTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await recordActivity("Deleted", "Product", `Deleted ${deleted.name}`);
  res.sendStatus(204);
});

router.post("/product-sources/preview", async (req, res): Promise<void> => {
  const parsed = PreviewProductSourceBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const url = parsed.data.url;
  res.json({
    url,
    platform: platformFromUrl(url),
    externalProductId: null,
    title: null,
    imageUrl: null,
    price: null,
    currency: null,
    seller: null,
    importStatus: "manual_required",
    message:
      "Automatic public metadata was not available. Review and enter product details manually.",
  });
});

router.get("/suppliers", async (_req, res): Promise<void> => {
  const suppliers = await db.select().from(suppliersTable);
  const products = await db.select().from(productsTable);
  const orders = await db.select().from(ordersTable);
  res.json(
    suppliers.map((supplier) => ({
      ...supplier,
      productCount: products.filter((item) => item.supplierId === supplier.id)
        .length,
      orderCount: orders.filter((item) => item.supplierId === supplier.id)
        .length,
      totalPurchasedBrl: 0,
    })),
  );
});

router.post("/suppliers", async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [supplier] = await db.insert(suppliersTable).values(parsed.data).returning();
  await recordActivity("Created", "Supplier", `Added ${supplier.name}`);
  res.status(201).json({
    ...supplier,
    productCount: 0,
    orderCount: 0,
    totalPurchasedBrl: 0,
  });
});

router.get("/suppliers/:id", async (req, res): Promise<void> => {
  const parsed = GetSupplierParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const supplier = (
    await db
      .select()
      .from(suppliersTable)
      .where(eq(suppliersTable.id, parsed.data.id))
      .limit(1)
  )[0];
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json({
    ...supplier,
    productCount: 0,
    orderCount: 0,
    totalPurchasedBrl: 0,
  });
});

router.patch("/suppliers/:id", async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  const body = CreateSupplierBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Invalid supplier data" });
    return;
  }
  const [supplier] = await db
    .update(suppliersTable)
    .set(body.data)
    .where(eq(suppliersTable.id, params.data.id))
    .returning();
  if (!supplier) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.json({
    ...supplier,
    productCount: 0,
    orderCount: 0,
    totalPurchasedBrl: 0,
  });
});

router.delete("/suppliers/:id", async (req, res): Promise<void> => {
  const parsed = DeleteSupplierParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [deleted] = await db
    .delete(suppliersTable)
    .where(eq(suppliersTable.id, parsed.data.id))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Supplier not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/orders", async (_req, res): Promise<void> => {
  const orders = await db
    .select({
      order: ordersTable,
      supplierName: suppliersTable.name,
    })
    .from(ordersTable)
    .leftJoin(suppliersTable, eq(ordersTable.supplierId, suppliersTable.id))
    .orderBy(desc(ordersTable.orderedAt));
  res.json(
    orders.map(({ order, supplierName }) => ({ ...order, supplierName })),
  );
});

router.post("/orders", async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [order] = await db.insert(ordersTable).values(parsed.data).returning();
  await recordActivity("Created", "Order", `Created ${order.orderCode}`);
  res.status(201).json({ ...order, supplierName: null });
});

const importTotal = (data: {
  productCostBrl: number;
  domesticShippingBrl: number;
  cssbuyFeesBrl: number;
  internationalShippingBrl: number;
  insuranceBrl: number;
  taxesBrl: number;
  packagingBrl: number;
  otherCostsBrl: number;
}) =>
  data.productCostBrl +
  data.domesticShippingBrl +
  data.cssbuyFeesBrl +
  data.internationalShippingBrl +
  data.insuranceBrl +
  data.taxesBrl +
  data.packagingBrl +
  data.otherCostsBrl;

router.get("/imports", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      record: importsTable,
      supplierName: suppliersTable.name,
    })
    .from(importsTable)
    .leftJoin(suppliersTable, eq(importsTable.supplierId, suppliersTable.id))
    .orderBy(desc(importsTable.createdAt));
  res.json(
    rows.map(({ record, supplierName }) => ({ ...record, supplierName })),
  );
});

router.post("/imports", async (req, res): Promise<void> => {
  const parsed = CreateImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const totalInvestmentBrl = importTotal(data);
  const [record] = await db
    .insert(importsTable)
    .values({
      ...data,
      totalInvestmentBrl,
      potentialProfitBrl: data.potentialRevenueBrl - totalInvestmentBrl,
    })
    .returning();
  await recordActivity("Created", "Import", `Created ${record.importCode}`);
  res.status(201).json({ ...record, supplierName: null });
});

router.post("/imports/:id/complete", async (req, res): Promise<void> => {
  const parsed = CompleteImportParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [record] = await db
    .update(importsTable)
    .set({ status: "Added to Inventory", completedAt: new Date() })
    .where(
      and(
        eq(importsTable.id, parsed.data.id),
        sql`${importsTable.completedAt} is null`,
      ),
    )
    .returning();
  if (!record) {
    res.status(409).json({ error: "Import is already completed or missing" });
    return;
  }
  await recordActivity("Completed", "Import", `Added ${record.importCode} to inventory`);
  res.json({ ...record, supplierName: null });
});

router.get("/shipments", async (_req, res): Promise<void> => {
  const shipments = await db
    .select()
    .from(shipmentsTable)
    .orderBy(desc(shipmentsTable.createdAt));
  res.json(shipments);
});

router.post("/shipments", async (req, res): Promise<void> => {
  const parsed = CreateShipmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [shipment] = await db
    .insert(shipmentsTable)
    .values({
      ...parsed.data,
      eta: parsed.data.eta
        ? parsed.data.eta.toISOString().slice(0, 10)
        : undefined,
    })
    .returning();
  await recordActivity("Created", "Shipment", `Created ${shipment.shipmentCode}`);
  res.status(201).json(shipment);
});

router.get("/sales", async (_req, res): Promise<void> => {
  const rows = await db
    .select({ sale: salesTable, productName: productsTable.name })
    .from(salesTable)
    .leftJoin(productsTable, eq(salesTable.productId, productsTable.id))
    .orderBy(desc(salesTable.soldAt));
  res.json(rows.map(({ sale, productName }) => ({ ...sale, productName })));
});

router.post("/sales", async (req, res): Promise<void> => {
  const parsed = CreateSaleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;
  const product = data.productId
    ? (
        await db
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, data.productId))
          .limit(1)
      )[0]
    : undefined;
  if (data.productId && !product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  if (product && product.currentStock < data.quantity) {
    res.status(409).json({ error: "Insufficient available stock" });
    return;
  }
  const revenueBrl = data.sellingPriceBrl * data.quantity - data.discountBrl;
  const productCostBrl = (product?.costBrl ?? 0) * data.quantity;
  const realizedProfitBrl =
    revenueBrl - productCostBrl - data.logisticsCostBrl;
  const [sale] = await db
    .insert(salesTable)
    .values({
      ...data,
      revenueBrl,
      productCostBrl,
      realizedProfitBrl,
    })
    .returning();
  if (product) {
    await db
      .update(productsTable)
      .set({ currentStock: product.currentStock - data.quantity })
      .where(eq(productsTable.id, product.id));
  }
  await recordActivity("Created", "Sale", `Recorded ${sale.saleCode}`);
  res.status(201).json({ ...sale, productName: product?.name ?? null });
});

router.get("/expenses", async (_req, res): Promise<void> => {
  res.json(
    await db.select().from(expensesTable).orderBy(desc(expensesTable.spentAt)),
  );
});

router.post("/expenses", async (req, res): Promise<void> => {
  const parsed = CreateExpenseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [expense] = await db.insert(expensesTable).values(parsed.data).returning();
  await recordActivity("Created", "Expense", `Recorded ${expense.category}`);
  res.status(201).json(expense);
});

router.get("/alerts", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(alertsTable)
    .orderBy(desc(alertsTable.createdAt));
  res.json(rows.map((alert) => ({ ...alert, isRead: alert.isRead === 1 })));
});

router.post("/alerts/:id/read", async (req, res): Promise<void> => {
  const parsed = MarkAlertReadParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [alert] = await db
    .update(alertsTable)
    .set({ isRead: 1 })
    .where(eq(alertsTable.id, parsed.data.id))
    .returning();
  if (!alert) {
    res.status(404).json({ error: "Alert not found" });
    return;
  }
  res.json({ ...alert, isRead: true });
});

router.get("/settings", async (_req, res): Promise<void> => {
  let settings = (await db.select().from(settingsTable).limit(1))[0];
  if (!settings) {
    [settings] = await db
      .insert(settingsTable)
      .values({})
      .returning();
  }
  res.json(settings);
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  let settings = (await db.select().from(settingsTable).limit(1))[0];
  if (!settings) {
    [settings] = await db.insert(settingsTable).values(parsed.data).returning();
  } else {
    [settings] = await db
      .update(settingsTable)
      .set(parsed.data)
      .where(eq(settingsTable.id, settings.id))
      .returning();
  }
  res.json(settings);
});

export default router;