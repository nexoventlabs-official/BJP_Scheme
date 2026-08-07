require('dotenv').config();
const axios = require('axios');
const v = process.env.META_GRAPH_VERSION || 'v22.0';
const token = process.env.META_ACCESS_TOKEN;
const ids = [process.env.WHATSAPP_REG_FLOW_ID, process.env.WHATSAPP_SERVICE_FLOW_ID].filter(Boolean);

(async () => {
  for (const id of ids) {
    try {
      const { data } = await axios.get(`https://graph.facebook.com/${v}/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { fields: 'id,name,status,validation_errors' },
      });
      console.log(`\n=== Flow ${id} (${data.name}) status=${data.status} ===`);
      console.log(JSON.stringify(data.validation_errors || [], null, 2));
    } catch (e) {
      console.log(`Flow ${id} error:`, e.response?.data || e.message);
    }
  }
  process.exit(0);
})();
