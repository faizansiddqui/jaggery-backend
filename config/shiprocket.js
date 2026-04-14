// Minimal placeholder for Shiprocket config (ES module)
export const apiKey = process.env.SHIPROCKET_API_KEY || '';
export const apiSecret = process.env.SHIPROCKET_API_SECRET || '';

// Placeholder for fetchShiprocketTrackingSnapshot
export function fetchShiprocketTrackingSnapshot(orderId) {
    // Dummy implementation
    return Promise.resolve({ status: 'Not implemented', orderId });
}

// Placeholder for getShiprocketLabelUrl
export function getShiprocketLabelUrl(orderId) {
    // Dummy implementation
    return `https://api.shiprocket.in/v1/external/courier/label/${orderId}`;
}
