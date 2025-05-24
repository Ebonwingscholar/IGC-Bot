module.exports = {
    // The Discord role ID that has admin privileges (can reset reservations)
    ADMIN_ROLE_ID: process.env.ADMIN_ROLE_ID || 'YOUR_ADMIN_ROLE_ID_HERE',
    
    // Channel IDs where the bot can be used (leave empty to allow all channels)
    ALLOWED_CHANNEL_IDS: process.env.ALLOWED_CHANNEL_IDS ? process.env.ALLOWED_CHANNEL_IDS.split(',') : [],
    
    // Command prefix for DM commands
    PREFIX: '!',
    
    // Help message text
    HELP_TEXT: `
**Wargaming Table Reservation Bot Commands:**
- \`/reserve <details>\` - Reserve a table (format: "Player1, Player2 | Game Name")
- \`/cancel\` - Cancel your reservation
- \`/view\` - View all current reservations
- \`/reset\` - Reset all reservations (Admin only)

You can also use these commands in DMs with the bot:
- \`!reserve <player names> | <game name>\` - Reserve a table
- \`!cancel\` - Cancel your reservation
- \`!view\` - View all current reservations
- \`!reset\` - Reset all reservations (Admin only)
- \`!help\` - Show this help message
    `
};
