import dotenv from 'dotenv';

dotenv.config();

const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

/**
 * Call the Groq Chat Completions API.
 */
async function callGroq(prompt, systemPrompt = '') {
  try {
    if (!GROQ_API_KEY) {
      throw new Error('Groq API key is not configured.');
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.2,
        max_tokens: 1024
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Primary Model Error:', errorText, 'status:', response.status);
      
      // Fallback model if primary model is rate limited or unavailable
      console.log('🔄 Attempting fallback model: llama-3.1-8b-instant...');
      const fallbackResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: messages,
          temperature: 0.2,
          max_tokens: 1024
        })
      });

      if (!fallbackResponse.ok) {
        const fallbackErr = await fallbackResponse.text();
        console.error('Groq API Fallback Model Error:', fallbackErr);
        throw new Error(`Groq API returned status ${response.status} (Fallback status ${fallbackResponse.status})`);
      }

      const fallbackData = await fallbackResponse.json();
      return fallbackData.choices?.[0]?.message?.content?.trim() || '';
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  } catch (err) {
    console.error('Error in callGroq:', err.message);
    throw err;
  }
}

/**
 * Generate 3 actionable recommendations based on inventory state.
 */
export async function generateInsights(inventory, predictions) {
  const expiredCount = predictions.filter(p => p.riskLevel === 'Expired').length;
  const highRiskCount = predictions.filter(p => p.riskLevel === 'High').length;
  const lowStockCount = predictions.filter(p => p.reorderStatus === 'Urgent Restock').length;
  
  const sampleItems = predictions.slice(0, 10).map(p => ({
    name: p.name,
    qty: p.quantity,
    min: p.reorderStatus,
    risk: p.riskLevel,
    runOut: p.runOutDate,
    wasteQty: p.predictedWastageQty,
    loss: p.potentialLoss
  }));

  const prompt = `
You are the AI brain of PharmaTrack, an Intelligent Pharmacy Inventory Management System.
Analyze this inventory summary and generate exactly 3 concrete, specific, and actionable recommendations.
Keep each recommendation to a maximum of 2 sentences. Focus on reducing wastage, optimizing stock levels, and saving costs.

---
INVENTORY SUMMARY:
- Total Medicines in Inventory: ${inventory.length}
- Expired Batches: ${expiredCount}
- High Expiry/Wastage Risk Batches: ${highRiskCount}
- Low Stock Batches (Needs urgent restock): ${lowStockCount}

SAMPLE MEDICINES INVENTORY AND PREDICTIONS:
${JSON.stringify(sampleItems, null, 2)}
---

Generate the response in a JSON array format like this:
[
  "Recommendation 1 content",
  "Recommendation 2 content",
  "Recommendation 3 content"
]
Do not include any Markdown wrap like \`\`\`json. Just output the clean JSON array.
`;

  try {
    const resultText = await callGroq(prompt, "You are a professional clinical data auditor. Output ONLY a clean JSON array with no formatting, markdown codeblocks or conversational prefix/suffix.");
    // Strip any markdown code fences if Groq includes them
    const cleanJSON = resultText.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJSON);
  } catch (e) {
    console.error('Failed to parse Groq recommendations, falling back to heuristic insights. Error:', e.message);
    return [
      `Monitor the ${highRiskCount} medicines with high wastage risks and offer promotional prices.`,
      `Arrange restock for ${lowStockCount} medicines that are currently below their safety threshold.`,
      `Conduct a prompt sweep of the shelves to isolate and discard the ${expiredCount} expired medicine batches.`
    ];
  }
}

/**
 * Interactive chatbot assistant.
 */
export async function chatWithPharmacist(history, userQuery, inventorySummary, predictionsSummary) {
  // Construct a concise database context for the AI
  const prompt = `
You are "PharmaBot", the intelligent virtual pharmacist and inventory auditor for PharmaTrack.
You have direct, real-time access to the pharmacy's database and ML prediction metrics.
Respond in a helpful, professional, and concise manner. Use bullet points or short paragraphs where appropriate.

---
REAL-TIME PHARMACY DATABASE CONTEXT:
- Total Unique Medicines: ${inventorySummary.totalMedicines}
- Out of Stock / Low Stock Items: ${JSON.stringify(inventorySummary.lowStockItems)}
- Expired / Expiring Soon Items: ${JSON.stringify(predictionsSummary.expiringSoonItems)}
- Top Selling Medicines (Estimated): ${JSON.stringify(inventorySummary.topSellers)}
- Active Supplier Directory: ${JSON.stringify(inventorySummary.activeSuppliers)}
- Recent Sales Transactions (Last 5 Sales): ${JSON.stringify(inventorySummary.recentSales)}
- Active Alert Email Configuration: ${inventorySummary.alertEmail || 'Not Configured'}
---

CHAT HISTORY:
${history.map(h => `${h.sender === 'user' ? 'Pharmacist' : 'PharmaBot'}: ${h.text}`).join('\n')}

Pharmacist's New Message: ${userQuery}

Provide your response to the Pharmacist:
`;

  try {
    const response = await callGroq(prompt, "You are a helpful pharmacist AI assistant named PharmaBot. You are knowledgeable, precise, and polite. Always format your responses using clean markdown.");
    return response;
  } catch (err) {
    console.error('Failed to get Groq chatbot response:', err.message);
    return `PharmaBot Service Error: ${err.message}. Please check back in a moment.`;
  }
}
