import pool from './db.js';

/**
 * Run predictive analytics on the inventory.
 * Combines current medicine quantities with sales history to project wastage, run-out times, and restock actions.
 */
export async function calculatePredictions(userId) {
  try {
    // 1. Get medicines filtered by userId if provided
    const medicinesRes = userId
      ? await pool.query('SELECT * FROM medicines WHERE user_id = $1 ORDER BY id ASC', [userId])
      : await pool.query('SELECT * FROM medicines ORDER BY id ASC');
    const medicines = medicinesRes.rows;

    // 2. Get sales velocity for each medicine filtered by userId
    const salesRes = userId
      ? await pool.query(`
          SELECT 
            medicine_id, 
            SUM(quantity) as total_sold,
            MIN(sale_date) as first_sale,
            MAX(sale_date) as last_sale,
            COUNT(id) as transaction_count
          FROM sales
          WHERE user_id = $1
          GROUP BY medicine_id
        `, [userId])
      : await pool.query(`
          SELECT 
            medicine_id, 
            SUM(quantity) as total_sold,
            MIN(sale_date) as first_sale,
            MAX(sale_date) as last_sale,
            COUNT(id) as transaction_count
          FROM sales
          GROUP BY medicine_id
        `);
    
    const salesMap = {};
    salesRes.rows.forEach(row => {
      salesMap[row.medicine_id] = {
        totalSold: parseInt(row.total_sold) || 0,
        firstSale: new Date(row.first_sale),
        lastSale: new Date(row.last_sale),
        transactionCount: parseInt(row.transaction_count) || 0
      };
    });

    const now = new Date();
    const predictions = medicines.map(med => {
      const salesInfo = salesMap[med.id];
      let salesVelocity = 0.0; // units per day

      if (salesInfo) {
        // Calculate the timeframe in days between the first sale and today or last sale
        const timeDiff = now.getTime() - salesInfo.firstSale.getTime();
        const days = Math.max(1, Math.ceil(timeDiff / (1000 * 60 * 60 * 24)));
        
        // If sales started recently or a long time ago, calculate velocity over that span
        salesVelocity = Number((salesInfo.totalSold / days).toFixed(2));
      }

      // Calculate days until expiry
      const expiryDate = new Date(med.expiry_date);
      const msToExpiry = expiryDate.getTime() - now.getTime();
      const daysToExpiry = Math.ceil(msToExpiry / (1000 * 60 * 60 * 24));
      
      // Calculate predicted wastage quantity
      // Expected sales before expiry = sales velocity * days to expiry
      let expectedSalesBeforeExpiry = 0;
      let predictedWastageQty = 0;
      
      if (daysToExpiry > 0) {
        expectedSalesBeforeExpiry = Math.floor(salesVelocity * daysToExpiry);
        predictedWastageQty = Math.max(0, med.quantity - expectedSalesBeforeExpiry);
      } else {
        // Already expired
        predictedWastageQty = med.quantity;
      }

      // Calculate run out prediction
      let daysToRunOut = null;
      let runOutDateStr = 'Never (No sales history)';
      if (salesVelocity > 0) {
        daysToRunOut = Math.ceil(med.quantity / salesVelocity);
        const runOutDate = new Date(now.getTime() + daysToRunOut * 24 * 60 * 60 * 1000);
        runOutDateStr = runOutDate.toLocaleDateString();
      }

      // Calculate wastage risk and level
      // High risk if: Expired, OR predicted wastage > 0, OR expiring soon (< 30 days) and quantity > 0
      // Medium risk if: Expiring in < 90 days and quantity > 0
      // Low risk: otherwise
      let riskLevel = 'Low';
      let riskReason = 'Healthy demand and shelf life.';
      
      if (daysToExpiry <= 0) {
        riskLevel = 'Expired';
        riskReason = 'Medicine has expired and must be discarded.';
      } else if (predictedWastageQty > 0) {
        riskLevel = 'High';
        riskReason = `Predicted to waste ${predictedWastageQty} units due to slow sales velocity.`;
      } else if (daysToExpiry <= 30 && med.quantity > 0) {
        riskLevel = 'High';
        riskReason = `Expiring soon in ${daysToExpiry} days.`;
      } else if (daysToExpiry <= 90 && med.quantity > 0) {
        riskLevel = 'Medium';
        riskReason = `Expiring in ${daysToExpiry} days. Monitor sales closely.`;
      }

      // Reorder recommendation
      let reorderStatus = 'No Action';
      let recommendedOrderQty = 0;
      
      if (med.quantity <= med.min_stock_level) {
        reorderStatus = 'Urgent Restock';
        // Reorder quantity to meet min stock level * 2 + 7 days safety stock
        const safetyStock = Math.ceil(salesVelocity * 7);
        recommendedOrderQty = Math.max(10, (med.min_stock_level * 2) - med.quantity + safetyStock);
      } else if (med.quantity <= med.min_stock_level * 1.5) {
        reorderStatus = 'Restock Soon';
        const safetyStock = Math.ceil(salesVelocity * 5);
        recommendedOrderQty = Math.max(5, Math.ceil(med.min_stock_level * 1.5) - med.quantity + safetyStock);
      }

      const potentialLoss = Number((predictedWastageQty * med.price).toFixed(2));

      return {
        medicineId: med.id,
        name: med.name,
        batchNumber: med.batch_number,
        expiryDate: med.expiry_date,
        quantity: med.quantity,
        price: med.price,
        salesVelocity,
        daysToExpiry,
        predictedWastageQty,
        potentialLoss,
        daysToRunOut,
        runOutDate: runOutDateStr,
        riskLevel,
        riskReason,
        reorderStatus,
        recommendedOrderQty,
        supplierName: med.supplier_name,
        supplierEmail: med.supplier_email,
        supplierPhone: med.supplier_phone
      };
    });

    return predictions;
  } catch (err) {
    console.error('Error calculating predictions:', err.message);
    throw err;
  }
}
