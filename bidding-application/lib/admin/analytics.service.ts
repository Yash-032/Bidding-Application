import { prisma } from '@/lib/prisma';

export class AnalyticsService {
  /**
   * Helper to serialize BigInt objects and convert objects to clean JSON values.
   */
  serialize<T>(data: T): any {
    return JSON.parse(
      JSON.stringify(data, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value
      )
    );
  }

  /**
   * Fetch overview KPI numbers (sales, orders, customers, average order value, growth rates).
   */
  async getOverview(startDate: Date, endDate: Date) {
    const diff = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - diff);
    const prevEndDate = startDate;

    // Current period sales & orders
    const currentStats = await prisma.storeOrder.aggregate({
      where: {
        status: { in: ['PAID', 'FULFILLED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { totalPaise: true },
      _count: { id: true },
    });

    // Previous period sales & orders
    const prevStats = await prisma.storeOrder.aggregate({
      where: {
        status: { in: ['PAID', 'FULFILLED'] },
        createdAt: { gte: prevStartDate, lte: prevEndDate },
      },
      _sum: { totalPaise: true },
      _count: { id: true },
    });

    const currentRevenue = Number(currentStats._sum.totalPaise ?? 0) / 100;
    const prevRevenue = Number(prevStats._sum.totalPaise ?? 0) / 100;

    const currentOrders = currentStats._count.id;
    const prevOrders = prevStats._count.id;

    // Revenue growth %
    const revenueGrowth = prevRevenue === 0
      ? (currentRevenue > 0 ? 100 : 0)
      : ((currentRevenue - prevRevenue) / prevRevenue) * 100;

    // Orders growth %
    const ordersGrowth = prevOrders === 0
      ? (currentOrders > 0 ? 100 : 0)
      : ((currentOrders - prevOrders) / prevOrders) * 100;

    // Total Customers (non-admin registered users)
    const totalCustomers = await prisma.user.count({
      where: { role: { not: 'ADMIN' } },
    });

    // New Customers in current period
    const newCustomers = await prisma.user.count({
      where: {
        role: { not: 'ADMIN' },
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    // New Customers in previous period
    const prevNewCustomers = await prisma.user.count({
      where: {
        role: { not: 'ADMIN' },
        createdAt: { gte: prevStartDate, lte: prevEndDate },
      },
    });

    const customerGrowth = prevNewCustomers === 0
      ? (newCustomers > 0 ? 100 : 0)
      : ((newCustomers - prevNewCustomers) / prevNewCustomers) * 100;

    // Average Order Value (AOV)
    const currentAOV = currentOrders > 0 ? currentRevenue / currentOrders : 0;
    const prevAOV = prevOrders > 0 ? prevRevenue / prevOrders : 0;
    const aovGrowth = prevAOV === 0
      ? (currentAOV > 0 ? 100 : 0)
      : ((currentAOV - prevAOV) / prevAOV) * 100;

    return this.serialize({
      totalRevenue: currentRevenue,
      totalOrders: currentOrders,
      totalCustomers,
      newCustomers,
      averageOrderValue: currentAOV,
      growth: {
        revenue: revenueGrowth,
        orders: ordersGrowth,
        customers: customerGrowth,
        aov: aovGrowth,
      },
    });
  }

  /**
   * Fetch sales and order counts grouped by day, week, month, or hour.
   */
  async getRevenueTrend(startDate: Date, endDate: Date, groupBy: string) {
    let trunc = 'day';
    if (groupBy === 'hour') trunc = 'hour';
    else if (groupBy === 'week') trunc = 'week';
    else if (groupBy === 'month') trunc = 'month';

    const trend = await prisma.$queryRaw<Array<{ time: Date; revenue: bigint; count: bigint }>>`
      SELECT 
        date_trunc(${trunc}, "createdAt") as "time",
        COALESCE(SUM("totalPaise"), 0) as "revenue",
        COUNT("id") as "count"
      FROM "StoreOrder"
      WHERE "status" IN ('PAID', 'FULFILLED')
        AND "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    return trend.map((row) => ({
      date: row.time.toISOString(),
      revenue: Number(row.revenue) / 100,
      orders: Number(row.count),
    }));
  }

  /**
   * Fetch top-selling products and products with zero or low sales.
   */
  async getProducts(startDate: Date, endDate: Date) {
    // 1. Top Selling Products
    const itemsGrouped = await prisma.storeOrderItem.groupBy({
      by: ['productId', 'productTitle'],
      where: {
        storeOrder: {
          status: { in: ['PAID', 'FULFILLED'] },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      _sum: {
        quantity: true,
        lineTotalPaise: true,
      },
      orderBy: {
        _sum: {
          lineTotalPaise: 'desc',
        },
      },
      take: 10,
    });

    // Fetch images for top selling products
    const topProductIds = itemsGrouped.map((item) => item.productId);
    const productsInfo = await prisma.product.findMany({
      where: { id: { in: topProductIds } },
      select: {
        id: true,
        protectedImages: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    const imageMap = new Map(productsInfo.map((p) => [p.id, p.protectedImages[0]?.id ?? null]));

    const topSelling = itemsGrouped.map((item) => ({
      productId: item.productId,
      title: item.productTitle,
      quantity: item._sum.quantity ?? 0,
      revenue: Number(item._sum.lineTotalPaise ?? 0) / 100,
      imageId: imageMap.get(item.productId) ?? null,
    }));

    // 2. Zero or Low Sales Products
    const activeProducts = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        priceInRupees: true,
        stockQuantity: true,
        protectedImages: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });

    const salesCounts = await prisma.storeOrderItem.groupBy({
      by: ['productId'],
      where: {
        storeOrder: {
          status: { in: ['PAID', 'FULFILLED'] },
          createdAt: { gte: startDate, lte: endDate },
        },
      },
      _sum: {
        quantity: true,
      },
    });

    const salesMap = new Map(salesCounts.map((s) => [s.productId, s._sum.quantity ?? 0]));
    const lowOrZeroSales = activeProducts
      .map((p) => ({
        productId: p.id,
        title: p.title,
        price: Number(p.priceInRupees),
        stock: p.stockQuantity,
        salesCount: salesMap.get(p.id) ?? 0,
        imageId: p.protectedImages[0]?.id ?? null,
      }))
      .sort((a, b) => a.salesCount - b.salesCount)
      .slice(0, 10);

    return this.serialize({
      topSelling,
      lowOrZeroSales,
    });
  }

  /**
   * Fetch category-wise sales, revenue distribution, and category sales growth.
   */
  async getCategories(startDate: Date, endDate: Date) {
    const diff = endDate.getTime() - startDate.getTime();
    const prevStartDate = new Date(startDate.getTime() - diff);
    const prevEndDate = startDate;

    const queryPeriod = async (start: Date, end: Date) => {
      const items = await prisma.storeOrderItem.findMany({
        where: {
          storeOrder: {
            status: { in: ['PAID', 'FULFILLED'] },
            createdAt: { gte: start, lte: end },
          },
        },
        select: {
          lineTotalPaise: true,
          quantity: true,
          product: {
            select: {
              category: true,
              categoryNode: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      const categoryMap = new Map<string, { id: string; name: string; revenue: number; quantity: number }>();
      for (const item of items) {
        const catNode = item.product?.categoryNode;
        const name = catNode?.name ?? item.product?.category ?? 'OTHER';
        const id = catNode?.id ?? 'other';
        const revenue = Number(item.lineTotalPaise) / 100;
        const quantity = item.quantity;

        const existing = categoryMap.get(id) ?? { id, name, revenue: 0, quantity: 0 };
        existing.revenue += revenue;
        existing.quantity += quantity;
        categoryMap.set(id, existing);
      }

      return Array.from(categoryMap.values());
    };

    const currentData = await queryPeriod(startDate, endDate);
    const prevData = await queryPeriod(prevStartDate, prevEndDate);

    const prevMap = new Map(prevData.map((c) => [c.id, c]));
    const trending = currentData.map((curr) => {
      const prev = prevMap.get(curr.id);
      const prevRevenue = prev?.revenue ?? 0;
      const growth = prevRevenue === 0
        ? (curr.revenue > 0 ? 100 : 0)
        : ((curr.revenue - prevRevenue) / prevRevenue) * 100;
      return {
        ...curr,
        prevRevenue,
        growth,
      };
    }).sort((a, b) => b.growth - a.growth);

    const totalRevenue = currentData.reduce((sum, c) => sum + c.revenue, 0);
    const distribution = currentData.map((c) => ({
      id: c.id,
      name: c.name,
      revenue: c.revenue,
      quantity: c.quantity,
      percentage: totalRevenue > 0 ? (c.revenue / totalRevenue) * 100 : 0,
    })).sort((a, b) => b.percentage - a.percentage);

    return this.serialize({
      distribution,
      trending,
    });
  }

  /**
   * Fetch top customers and customers growth demographics.
   */
  async getCustomers(startDate: Date, endDate: Date) {
    // Top customers by total spend
    const topCustomersRaw = await prisma.storeOrder.groupBy({
      by: ['userId'],
      where: {
        status: { in: ['PAID', 'FULFILLED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      _sum: { totalPaise: true },
      _count: { id: true },
      orderBy: [ { _sum: { totalPaise: 'desc', }, }, { _count: { id: 'desc', }, },],
      take: 10,
    });

    const userIds = topCustomersRaw.map((c) => c.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        email: true,
        createdAt: true,
        profile: {
          select: {
            fullName: true,
          },
        },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));

    const topCustomers = topCustomersRaw.map((c) => {
      const u = userMap.get(c.userId);
      return {
        userId: c.userId,
        email: u?.email ?? 'Unknown',
        fullName: u?.profile?.fullName ?? 'N/A',
        orderCount: c._count.id,
        totalSpent: Number(c._sum.totalPaise ?? 0) / 100,
        joinedDate: u?.createdAt.toISOString() ?? null,
      };
    });

    // Recent orders log
    const recentOrdersRaw = await prisma.storeOrder.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      include: {
        user: {
          select: {
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        items: {
          select: {
            productTitle: true,
            quantity: true,
            size: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    const recentOrders = recentOrdersRaw.map((order) => ({
      id: order.id,
      customerEmail: order.user.email,
      customerName: order.user.profile?.fullName ?? 'N/A',
      productsSummary: order.items.map((i) => `${i.productTitle} (${i.size}) x${i.quantity}`).join(', '),
      amount: Number(order.totalPaise) / 100,
      status: order.status,
      date: order.createdAt.toISOString(),
    }));

    return this.serialize({
      topCustomers,
      recentOrders,
    });
  }

  /**
   * Fetch inventory statistics: size metrics, low stock, out of stock, and dashboard alerts.
   */
  async getInventory() {
    // 1. Size-wise sales & demand
    const sizeStats = await prisma.storeOrderItem.groupBy({
      by: ['size'],
      where: {
        storeOrder: {
          status: { in: ['PAID', 'FULFILLED'] },
        },
      },
      _sum: {
        quantity: true,
        lineTotalPaise: true,
      },
      orderBy: {
        _sum: {
          quantity: 'desc',
        },
      },
    });

    const sizes = sizeStats.map((s) => ({
      size: s.size,
      quantity: s._sum.quantity ?? 0,
      revenue: Number(s._sum.lineTotalPaise ?? 0) / 100,
    }));

    // 2. Low stock & out of stock products
    const products = await prisma.product.findMany({
      where: { isActive: true },
      select: {
        id: true,
        title: true,
        stockQuantity: true,
        priceInRupees: true,
      },
    });

    const lowStock = products
      .filter((p) => p.stockQuantity > 0 && p.stockQuantity <= 5)
      .map((p) => ({ id: p.id, title: p.title, stock: p.stockQuantity, price: Number(p.priceInRupees) }));

    const outOfStock = products
      .filter((p) => p.stockQuantity === 0)
      .map((p) => ({ id: p.id, title: p.title, stock: p.stockQuantity, price: Number(p.priceInRupees) }));

    // 3. Alerts construction
    const alerts: Array<{ type: 'danger' | 'warning' | 'info' | 'success'; message: string; details?: string }> = [];

    // Out of stock alerts
    for (const item of outOfStock.slice(0, 3)) {
      alerts.push({
        type: 'danger',
        message: `Product out of stock: "${item.title}"`,
        details: 'Customers cannot purchase this item. Refill stock soon.',
      });
    }

    // Low stock alerts
    for (const item of lowStock.slice(0, 3)) {
      alerts.push({
        type: 'warning',
        message: `Low inventory warning: "${item.title}"`,
        details: `Only ${item.stock} left in stock.`,
      });
    }

    // High demand with low stock
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const recentSales = await prisma.storeOrderItem.groupBy({
      by: ['productId'],
      where: {
        storeOrder: {
          status: { in: ['PAID', 'FULFILLED'] },
          createdAt: { gte: last30Days },
        },
      },
      _sum: { quantity: true },
    });
    const highDemandIds = recentSales
      .filter((s) => (s._sum.quantity ?? 0) >= 5)
      .map((s) => s.productId);

    const highDemandLowStock = products.filter(
      (p) => highDemandIds.includes(p.id) && p.stockQuantity <= 5
    );

    for (const item of highDemandLowStock.slice(0, 3)) {
      alerts.push({
        type: 'danger',
        message: `High demand & Low stock: "${item.title}"`,
        details: `This item is trending (sold >= 5 units recently) but has only ${item.stockQuantity} left.`,
      });
    }

    // Long pending orders (paid but not fulfilled > 48h, or payment pending > 24h)
    const limit48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const limit24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const longPendingPaid = await prisma.storeOrder.count({
      where: {
        status: 'PAID',
        createdAt: { lte: limit48h },
      },
    });

    if (longPendingPaid > 0) {
      alerts.push({
        type: 'warning',
        message: `${longPendingPaid} paid orders are pending fulfillment for over 48 hours`,
        details: 'Review order fulfillment queue to prevent shipment delays.',
      });
    }

    const longPendingPayment = await prisma.storeOrder.count({
      where: {
        status: 'PAYMENT_PENDING',
        createdAt: { lte: limit24h },
      },
    });

    if (longPendingPayment > 0) {
      alerts.push({
        type: 'info',
        message: `${longPendingPayment} orders are stuck in payment pending status for over 24 hours`,
        details: 'Consider contacting customers or checking webhook status.',
      });
    }

    // Sales declining / Growth check
    const last7Days = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const prev7Days = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const curr7DayRev = await prisma.storeOrder.aggregate({
      where: {
        status: { in: ['PAID', 'FULFILLED'] },
        createdAt: { gte: last7Days },
      },
      _sum: { totalPaise: true },
    });

    const prev7DayRev = await prisma.storeOrder.aggregate({
      where: {
        status: { in: ['PAID', 'FULFILLED'] },
        createdAt: { gte: prev7Days, lte: last7Days },
      },
      _sum: { totalPaise: true },
    });

    const currRevVal = Number(curr7DayRev._sum.totalPaise ?? 0) / 100;
    const prevRevVal = Number(prev7DayRev._sum.totalPaise ?? 0) / 100;

    if (prevRevVal > 0) {
      const decline = ((prevRevVal - currRevVal) / prevRevVal) * 100;
      if (decline > 20) {
        alerts.push({
          type: 'danger',
          message: `Sales are declining by ${decline.toFixed(1)}% week-over-week`,
          details: `Revenue fell from ₹${prevRevVal.toLocaleString()} last week to ₹${currRevVal.toLocaleString()} this week.`,
        });
      } else if (currRevVal > prevRevVal * 1.2) {
        const growth = ((currRevVal - prevRevVal) / prevRevVal) * 100;
        alerts.push({
          type: 'success',
          message: `Trending sales: revenue increased by ${growth.toFixed(1)}% week-over-week!`,
          details: `Revenue rose to ₹${currRevVal.toLocaleString()} this week.`,
        });
      }
    }

    return this.serialize({
      sizes,
      lowStock,
      outOfStock,
      alerts,
    });
  }

  /**
   * Fetch cart metrics (conversion rate, top items added to cart).
   */
  async getCarts() {
    // 1. Cart-to-order conversion rate
    // We compute: completed orders vs (completed orders + active carts)
    const completedOrders = await prisma.storeOrder.count({
      where: { status: { in: ['PAID', 'FULFILLED'] } },
    });

    const activeCarts = await prisma.cart.count({
      where: {
        items: { some: {} },
      },
    });

    const conversionRate = completedOrders + activeCarts > 0 ? (completedOrders / (completedOrders + activeCarts)) * 100 : 0;

    // 2. Most added-to-cart products
    const cartItemsGrouped = await prisma.cartItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      _count: { cartId: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });

    const cartProductIds = cartItemsGrouped.map((c) => c.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: cartProductIds } },
      select: {
        id: true,
        title: true,
        priceInRupees: true,
        protectedImages: {
          orderBy: { sortOrder: 'asc' },
          take: 1,
          select: { id: true },
        },
      },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const mostAdded = cartItemsGrouped.map((item) => {
      const p = productMap.get(item.productId);
      return {
        productId: item.productId,
        title: p?.title ?? 'Unknown Product',
        price: Number(p?.priceInRupees ?? 0),
        cartCount: item._count.cartId,
        totalQuantity: item._sum.quantity ?? 0,
        imageId: p?.protectedImages[0]?.id ?? null,
      };
    });

    return this.serialize({
      conversion: {
        completedOrders,
        activeCarts,
        rate: conversionRate,
      },
      mostAdded,
    });
  }

  /**
   * Fetch auction analytics: active/closed auctions, total bids, max bids, details.
   */
  async getAuctions(startDate: Date, endDate: Date) {
    const activeAuctions = await prisma.auction.count({
      where: { status: 'ACTIVE' },
    });

    const completedAuctions = await prisma.auction.count({
      where: { status: 'CLOSED' },
    });

    const totalBids = await prisma.bid.count({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const maxBidRaw = await prisma.bid.aggregate({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
      _max: {
        amountCredits: true,
      },
    });

    // Top active/recent auctions performance
    const auctionsRaw = await prisma.auction.findMany({
      include: {
        product: {
          select: {
            title: true,
            priceInRupees: true,
          },
        },
        bids: {
          orderBy: { amountCredits: 'desc' },
          select: {
            amountCredits: true,
            user: { select: { email: true } },
          },
        },
      },
      orderBy: { endTime: 'desc' },
      take: 10,
    });

    const auctions = auctionsRaw.map((a) => {
      const highestBid = a.bids[0];
      return {
        id: a.id,
        title: a.product.title,
        retailPrice: Number(a.product.priceInRupees),
        startTime: a.startTime.toISOString(),
        endTime: a.endTime.toISOString(),
        status: a.status,
        bidsCount: a.bids.length,
        highestBidAmount: highestBid ? Number(highestBid.amountCredits) : 0,
        highestBidder: highestBid ? highestBid.user.email : 'None',
      };
    });

    return this.serialize({
      activeAuctions,
      completedAuctions,
      totalBids,
      highestBid: Number(maxBidRaw._max.amountCredits ?? 0),
      auctions,
    });
  }
}
