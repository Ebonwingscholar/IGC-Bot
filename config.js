module.exports = {
    ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID || 'YOUR_ADMIN_ROLE_ID_HERE',
    ALLOWED_CHANNEL_IDS: process.env.ALLOWED_CHANNEL_IDS ? process.env.ALLOWED_CHANNEL_IDS.split(',') : [],
    PREFIX: '!',
    HELP_TEXT: `
**Inverurie Gaming Club Bot Commands:**
- \`/createevent\` - Create a new club event (Admin only)
- \`/bookevent\` - Book a table for an upcoming event
- \`/viewevents\` - View all upcoming events and player bookings
- \`/canceleventbooking\` - Cancel your event booking
- \`/stopevent\` - Cancel/delete an entire event (Admin only)
- \`/reserve\` - Open reservation modal / reserve a table for a date and session
- \`/cancel\` - Cancel your table reservation
- \`/view\` - View current table reservations
- \`/reset\` - Reset all general reservations (Admin only)
- \`/canceltable\` - Cancel a specific table (Admin only)
- \`/adminreserve\` - Reserve a specific table (Admin only)
    `
};
