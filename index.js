const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Antinuke Premium Bot Running 🛡️'));
app.listen(PORT, () => console.log(`✅ Port ${PORT} open — Ready!`));

const { Client, Events, GatewayIntentBits, AuditLogEvent, EmbedBuilder, REST, Routes, PermissionsBitField } = require('discord.js');

const token = process.env.token;
const botOwnerId = process.env.ownerId;

// === CONFIGURATION ===
const CONFIG = {
  prefix: '!',
  premiumKey: 'premiumactivationgodsosixev',
  whitelist: [botOwnerId],
  whitelistedRoles: [],
  premiumGuilds: new Set(),
  strictMode: false,
  thresholds: {
    bans: 2, kicks: 2, channels: 2, roles: 2, webhooks: 1, bots: 1
  },
  timeWindow: 15000,
  guildPrefixes: new Map(),
  guildPfp: new Map()
};

const tracker = new Map();

// === HELPER: Check if user has owner access ===
async function hasOwnerAccess(member, guild) {
  if (member.id === botOwnerId) return true;
  const fetchedGuild = guild || await member.client.guilds.fetch(member.guildId).catch(() => null);
  if (fetchedGuild && fetchedGuild.ownerId === member.id) return true;
  return false;
}

// === BOT SETUP ===
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration
  ]
});

// === SLASH COMMANDS ===
const commands = [
  { name: 'help', description: 'Show all commands & your current prefix' },
  { name: 'premcmds', description: 'Show Premium features list' },
  {
    name: 'premium',
    description: 'Manage premium features',
    options: [
      { name: 'activate', description: 'Activate premium with code', type: 3, required: true }
    ]
  },
  {
    name: 'antinuke',
    description: 'Control anti-nuke protection',
    options: [
      { name: 'enable', description: 'Turn anti-nuke ON' },
      { name: 'disable', description: 'Turn anti-nuke OFF' },
      { name: 'status', description: 'Check protection status' },
      { name: 'strictenable', description: 'Enable STRICT mode — instant ban' },
      { name: 'strictdisable', description: 'Disable STRICT mode' }
    ]
  },
  {
    name: 'botpfp',
    description: 'Change bot avatar (Premium only)',
    options: [{ name: 'set', description: 'Upload new avatar', type: 11, required: true }]
  },
  {
    name: 'prefix',
    description: 'Change server command prefix',
    options: [{ name: 'set', description: 'New prefix (1-3 chars)', type: 3, required: true }]
  },
  {
    name: 'role',
    description: 'Role management',
    options: [
      { name: 'build', description: 'Create a new role', options: [
        { name: 'name', description: 'Role name', type: 3, required: true },
        { name: 'color', description: 'Hex color e.g. #ff0000', type: 3 }
      ]},
      { name: 'add', description: 'Add role to member', options: [
        { name: 'user', description: 'Target user', type: 6, required: true },
        { name: 'role', description: 'Role to give', type: 8, required: true }
      ]},
      { name: 'remove', description: 'Remove role from member', options: [
        { name: 'user', description: 'Target user', type: 6, required: true },
        { name: 'role', description: 'Role to remove', type: 8, required: true }
      ]}
    ]
  },
  {
    name: 'mod',
    description: 'Moderation tools',
    options: [
      { name: 'ban', description: 'Ban a user', options: [
        { name: 'user', description: 'User to ban', type: 6, required: true },
        { name: 'reason', description: 'Reason', type: 3 }
      ]},
      { name: 'unban', description: 'Unban a user', options: [
        { name: 'userid', description: 'User ID to unban', type: 3, required: true }
      ]},
      { name: 'purge', description: 'Delete messages', options: [
        { name: 'amount', description: 'Number of messages (1-100)', type: 4, required: true }
      ]},
      { name: 'masspurge', description: 'Delete 100+ messages (Premium)', options: [
        { name: 'amount', description: 'Number of messages', type: 4, required: true }
      ]}
    ]
  },
  {
    name: 'whitelist',
    description: 'Whitelist management',
    options: [
      { name: 'add', description: 'Add user to whitelist', options: [{ name: 'user', type: 6, required: true }]},
      { name: 'remove', description: 'Remove user from whitelist', options: [{ name: 'user', type: 6, required: true }]},
      { name: 'addr', description: 'Add role to whitelist', options: [{ name: 'role', type: 8, required: true }]},
      { name: 'remover', description: 'Remove role from whitelist', options: [{ name: 'role', type: 8, required: true }]},
      { name: 'massadd', description: 'Mass add users by ID (Premium)', options: [{ name: 'ids', type: 3, required: true }]},
      { name: 'massremove', description: 'Mass remove users by ID (Premium)', options: [{ name: 'ids', type: 3, required: true }]},
      { name: 'list', description: 'Show all whitelisted users & roles' }
    ]
  },
  { name: 'ping', description: 'Check bot latency' }
];

// === READY ===
client.on(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  try {
    const rest = new REST({ version: '10' }).setToken(token);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('💎 All Commands Registered — Bot Ready!');
  } catch (err) { console.error('Command Error:', err); }
});

// === ANTI-NUKE DETECTION ===
client.on(Events.GuildAuditLogEntryCreate, async (entry) => {
  const { action, executor, guild } = entry;
  if (!executor) return;
  
  const isBotOwner = executor.id === botOwnerId;
  const isServerOwner = guild.ownerId === executor.id;
  if (isBotOwner || isServerOwner || CONFIG.whitelist.includes(executor.id)) return;
  
  const hasWhitelistedRole = executor.roles ? [...executor.roles.cache.values()].some(r => CONFIG.whitelistedRoles.includes(r.id)) : false;
  if (hasWhitelistedRole) return;

  const now = Date.now();
  const key = `${guild.id}-${executor.id}`;
  if (!tracker.has(key)) tracker.set(key, []);
  const actions = tracker.get(key);
  actions.push({ action, time: now });
  
  const recent = actions.filter(a => now - a.time < CONFIG.timeWindow);
  tracker.set(key, recent);

  let type = null;
  if (action === AuditLogEvent.MemberBanAdd) type = 'bans';
  if (action === AuditLogEvent.MemberKick) type = 'kicks';
  if ([AuditLogEvent.ChannelCreate, AuditLogEvent.ChannelDelete].includes(action)) type = 'channels';
  if ([AuditLogEvent.RoleCreate, AuditLogEvent.RoleDelete].includes(action)) type = 'roles';
  if ([AuditLogEvent.WebhookCreate, AuditLogEvent.WebhookDelete].includes(action)) type = 'webhooks';

  if (!type) return;
  if (CONFIG.strictMode || recent.length >= CONFIG.thresholds[type]) {
    try {
      const member = await guild.members.fetch(executor.id).catch(() => null);
      if (member) await member.ban({ reason: `Anti-Nuke: ${type} threshold exceeded` });
      console.log(`🚨 Banned ${executor.tag} — ${type}`);
    } catch (e) {}
  }
});

// === SLASH COMMAND HANDLER ===
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, user, options, guildId, member } = interaction;
  
  const isBotOwner = user.id === botOwnerId;
  const isServerOwner = interaction.guild?.ownerId === user.id;
  const isOwner = isBotOwner || isServerOwner;
  const isPremium = CONFIG.premiumGuilds.has(guildId);
  const getPrefix = () => CONFIG.guildPrefixes.get(guildId) || CONFIG.prefix;

  if (commandName === 'ping') {
    await interaction.reply(`🏓 Pong! Latency: **${client.ws.ping}ms**\n🔤 Your Prefix: \`${getPrefix()}\``);
  }

  if (commandName === 'help') {
    const prefix = getPrefix();
    const roleText = isBotOwner ? '👑 Bot Owner' : (isServerOwner ? '🏠 Server Owner' : '👤 Member');
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🛡️ SAKATO — Help Menu')
      .setDescription(`🔤 **Current Prefix:** \`${prefix}\`\n👤 **Your Role:** ${roleText}\nUse \`${prefix}help\` or \`/help\` to show this menu`)
      .addFields(
        { name: '📋 Basic Commands', value: `\`/ping\` — Check bot online & latency\n\`/help\` — Show this menu\n\`/premcmds\` — Premium info\n\n**Prefix Style:**\n\`${prefix}ping\`\n\`${prefix}help\`` },
        { name: '🔐 Owner Commands', value: isOwner 
          ? `\`/antinuke enable/disable\` — Toggle protection\n\`/antinuke status\` — Check status\n\`/antinuke strictenable\` — Instant ban mode ON\n\`/antinuke strictdisable\` — Instant ban mode OFF\n\`/prefix set <new>\` — Change prefix\n\`/role build/add/remove\` — Manage roles\n\`/mod ban/unban/purge\` — Moderation\n\`/whitelist add/remove/list\` — Protect users\n\`/whitelist addr/remover\` — Protect roles\n\n**Prefix Style:**\n\`${prefix}prefix !!\`\n\`${prefix}antinuke enable\``
          : '🔒 Only Server Owner or Bot Owner can use these' },
        { name: '⭐ Premium Commands', value: isPremium 
          ? `✅ **PREMIUM ACTIVE** ⭐\n\`/botpfp set\` — Change bot avatar\n\`/whitelist massadd <ids>\` — Bulk whitelist\n\`/whitelist massremove <ids>\` — Bulk remove\n\`/mod masspurge <amount>\` — Delete up to 500 messages\n\n**Prefix Style:**\n\`${prefix}premium activate <code>\``
          : `🔒 **PREMIUM LOCKED**\nActivate with:\n\`/premium activate code:${CONFIG.premiumKey}\`\nOr:\n\`${prefix}premium activate ${CONFIG.premiumKey}\`` }
      )
      .setColor(isPremium ? 'Gold' : 'Blue')
      .setFooter({ text: `Prefix: ${prefix} • Type ${prefix}help anytime` })
    ]});
  }

  if (commandName === 'premcmds') {
    const prefix = getPrefix();
    await interaction.reply({ embeds: [new EmbedBuilder()
      .setTitle('🛡️ Premium Features')
      .setDescription(`🔤 Prefix: \`${prefix}\``)
      .addFields(
        { name: '📋 Basic', value: `\`/ping\` \`/help\` \`/premcmds\`\nPrefix: \`${prefix}ping\` \`${prefix}help\`` },
        { name: '🔐 Owner Only', value: isOwner ? 'Anti-nuke control • Prefix change • Role management • Ban/Unban • Purge • Whitelist users & roles' : '🔒 Server Owner only' },
        { name: '⭐ Premium', value: isPremium ? '✅ Active — Avatar change • Mass whitelist • Mass purge' : `🔒 Locked\nActivate:\n\`/premium activate code:${CONFIG.premiumKey}\`\n\`${prefix}premium activate ${CONFIG.premiumKey}\`` }
      )
      .setColor(isPremium ? 'Gold' : 'Blue')
    ]});
  }

  if (commandName === 'premium') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner can activate Premium', ephemeral: true });
    const code = options.getString('activate');
    if (code === CONFIG.premiumKey) {
      CONFIG.premiumGuilds.set(guildId, true);
      await interaction.reply('✅ **PREMIUM ACTIVATED!** All features unlocked ⭐✨');
    } else {
      await interaction.reply({ content: '❌ Invalid code', ephemeral: true });
    }
  }

  if (commandName === 'antinuke') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const sub = options.getSubcommand();
    if (sub === 'enable') CONFIG.thresholds = { bans: 2, kicks: 2, channels: 2, roles: 2, webhooks: 1, bots: 1 };
    if (sub === 'disable') CONFIG.thresholds = { bans: 999, kicks: 999, channels: 999, roles: 999, webhooks: 999, bots: 999 };
    if (sub === 'strictenable') { CONFIG.strictMode = true; await interaction.reply('⚠️ STRICT MODE ON — Instant bans for all suspicious changes!'); return; }
    if (sub === 'strictdisable') { CONFIG.strictMode = false; await interaction.reply('✅ Strict mode OFF — normal thresholds active'); return; }
    if (sub === 'status') {
      await interaction.reply(`🛡️ Protection: **${CONFIG.thresholds.bans < 100 ? 'ACTIVE' : 'OFF'}**\nStrict Mode: **${CONFIG.strictMode ? 'ON' : 'OFF'}**\n🔤 Prefix: \`${getPrefix()}\``);
      return;
    }
    await interaction.reply(`✅ Anti-nuke **${sub === 'enable' ? 'ENABLED' : 'DISABLED'}**`);
  }

  if (commandName === 'prefix') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const newPrefix = options.getString('set');
    if (newPrefix.length > 3) return interaction.reply({ content: '❌ Prefix max 3 characters', ephemeral: true });
    CONFIG.guildPrefixes.set(guildId, newPrefix);
    await interaction.reply(`✅ Prefix changed to \`${newPrefix}\`\nTry: \`${newPrefix}ping\` or \`${newPrefix}help\``);
  }

  if (commandName === 'botpfp') {
    if (!isPremium) return interaction.reply({ content: '⭐ Premium required!', ephemeral: true });
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const attachment = options.getAttachment('set');
    if (!attachment) return interaction.reply({ content: '❌ No image provided', ephemeral: true });
    try {
      await client.user.setAvatar(attachment.url);
      await interaction.reply('✅ Avatar updated! (Applies bot-wide)');
    } catch (e) { await interaction.reply({ content: '❌ Failed to set avatar', ephemeral: true }); }
  }

  if (commandName === 'role') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const sub = options.getSubcommand();
    if (sub === 'build') {
      const name = options.getString('name');
      const color = options.getString('color') || '#0099ff';
      const role = await interaction.guild.roles.create({ name, color });
      await interaction.reply(`✅ Created role: <@&${role.id}>`);
    }
    if (sub === 'add') {
      const u = options.getUser('user');
      const r = options.getRole('role');
      const m = await interaction.guild.members.fetch(u.id);
      await m.roles.add(r);
      await interaction.reply(`✅ Gave <@&${r.id}> to ${u}`);
    }
    if (sub === 'remove') {
      const u = options.getUser('user');
      const r = options.getRole('role');
      const m = await interaction.guild.members.fetch(u.id);
      await m.roles.remove(r);
      await interaction.reply(`✅ Removed <@&${r.id}> from ${u}`);
    }
  }

  if (commandName === 'mod') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const sub = options.getSubcommand();
    if (sub === 'ban') {
      const u = options.getUser('user');
      const reason = options.getString('reason') || 'No reason';
      await interaction.guild.members.ban(u, { reason });
      await interaction.reply(`✅ Banned ${u}`);
    }
    if (sub === 'unban') {
      const uid = options.getString('userid');
      await interaction.guild.bans.remove(uid);
      await interaction.reply(`✅ Unbanned <@${uid}>`);
    }
    if (sub === 'purge') {
      const amt = Math.min(options.getInteger('amount'), 100);
      await interaction.channel.bulkDelete(amt, true);
      await interaction.reply(`✅ Deleted ${amt} messages`);
    }
    if (sub === 'masspurge') {
      if (!isPremium) return interaction.reply({ content: '⭐ Premium required!', ephemeral: true });
      if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
      const amt = options.getInteger('amount');
      const deleted = Math.min(amt, 500);
      await interaction.channel.bulkDelete(deleted, true);
      await interaction.reply(`✅ Mass purged ${deleted} messages`);
    }
  }

  if (commandName === 'whitelist') {
    if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
    const sub = options.getSubcommand();
    if (sub === 'add') {
      const u = options.getUser('user');
      if (!CONFIG.whitelist.includes(u.id)) CONFIG.whitelist.push(u.id);
      await interaction.reply(`✅ Whitelisted ${u}`);
    }
    if (sub === 'remove') {
      const u = options.getUser('user');
      CONFIG.whitelist = CONFIG.whitelist.filter(id => id !== u.id);
      await interaction.reply(`✅ Removed ${u}`);
    }
    if (sub === 'addr') {
      const r = options.getRole('role');
      if (!CONFIG.whitelistedRoles.includes(r.id)) CONFIG.whitelistedRoles.push(r.id);
      await interaction.reply(`✅ Whitelisted role: <@&${r.id}>`);
    }
    if (sub === 'remover') {
      const r = options.getRole('role');
      CONFIG.whitelistedRoles = CONFIG.whitelistedRoles.filter(id => id !== r.id);
      await interaction.reply(`✅ Removed role: <@&${r.id}>`);
    }
    if (sub === 'massadd') {
      if (!isPremium) return interaction.reply({ content: '⭐ Premium required!', ephemeral: true });
      if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
      const ids = options.getString('ids').split(/[\s,]+/).filter(Boolean);
      let added = 0;
      ids.forEach(id => { if (!CONFIG.whitelist.includes(id)) { CONFIG.whitelist.push(id); added++; } });
      await interaction.reply(`✅ Mass added ${added} users to whitelist`);
    }
    if (sub === 'massremove') {
      if (!isPremium) return interaction.reply({ content: '⭐ Premium required!', ephemeral: true });
      if (!isOwner) return interaction.reply({ content: '❌ Only Server Owner!', ephemeral: true });
      const ids = options.getString('ids').split(/[\s,]+/).filter(Boolean);
      const before = CONFIG.whitelist.length;
      CONFIG.whitelist = CONFIG.whitelist.filter(id => !ids.includes(id));
      await interaction.reply(`✅ Mass removed ${before - CONFIG.whitelist.length} users`);
    }
    if (sub === 'list') {
      const users = CONFIG.whitelist.map(id => `<@${id}>`).join('\n') || 'None';
      const roles = CONFIG.whitelistedRoles.map(id => `<@&${id}>`).join('\n') || 'None';
      await interaction.reply(`📋 **Whitelisted Users:**\n${users}\n\n📋 **Whitelisted Roles:**\n${roles}`);
    }
  }
});

// === PREFIX COMMANDS ===
client.on(Events.MessageCreate, async message => {
  if (message.author.bot) return;
  const prefix = CONFIG.guildPrefixes.get(message.guildId) || CONFIG.prefix;
  if (!message.content.startsWith(prefix)) return;
  
  const [cmd, ...args] = message.content.slice(prefix.length).trim().split(/\s+/);
  const isBotOwner = message.author.id === botOwnerId;
  const isServerOwner = message.guild?.ownerId === message.author.id;
  const isOwner = isBotOwner || isServerOwner;
  const isPremium = CONFIG.premiumGuilds.has(message.guildId);

  if (cmd === 'help') {
    const roleText = isBotOwner ? '👑 Bot Owner' : (isServerOwner ? '🏠 Server Owner' : '👤 Member');
    return message.reply({ embeds: [new EmbedBuilder()
      .setTitle('🛡️ SAKATO — Help Menu')
      .setDescription(`🔤 **Your Prefix:** \`${prefix}\`\n👤 **Your Role:** ${roleText}`)
      .addFields(
        { name: '📋 Basic', value: `\`${prefix}ping\` — Check bot\n\`${prefix}help\` — Show this menu` },
        { name: '🔐 Owner', value: isOwner
          ? `\`${prefix}prefix !new\` — Change prefix\n\`${prefix}antinuke enable/disable/strictenable/strictdisable/status\`\n\`${prefix}whitelist add @user\`\n\`${prefix}whitelist remove @user\`\n\`${prefix}whitelist addr @role\`\n\`${prefix}whitelist remover @role\`\n\`${prefix}whitelist list\`\n\`${prefix}role build Name #color\`\n\`${prefix}role add @user @role\`\n\`${prefix}role remove @user @role\`\n\`${prefix}mod ban @user reason\`\n\`${prefix}mod unban userID\`\n\`${prefix}mod purge 50\``
          : '🔒 Server Owner only' },
        { name: '⭐ Premium', value: isPremium ? `✅ Active\n\`${prefix}premium activate code\` — Already activated!\n\`${prefix}botpfp\` — Change avatar\n\`${prefix}whitelist massadd id1 id2 id3\`\n\`${prefix}whitelist massremove id1 id2\`\n\`${prefix}mod masspurge 200\`` : `🔒 Locked\nActivate:\n\`${prefix}premium activate ${CONFIG.premiumKey}\`` }
      )
      .setColor(isPremium ? 'Gold' : 'Blue')
    ]});
  }

  if (cmd === 'ping') return message.reply(`🏓 Pong! ${client.ws.ping}ms\n🔤 Prefix: \`${prefix}\``);
  
  if (cmd === 'prefix' && isOwner) {
    if (!args[0]) return message.reply(`🔤 Current prefix: \`${prefix}\``);
    if (args[0].length > 3) return message.reply('❌ Max 3 characters');
    CONFIG.guildPrefixes.set(message.guildId, args[0]);
    return message.reply(`✅ Prefix changed to \`${args[0]}\`\nTry: \`${args[0]}help\``);
  }
  
  if (cmd === 'premium' && args[0] === 'activate' && isOwner) {
    if (args[1] === CONFIG.premiumKey) {
      CONFIG.premiumGuilds.set(message.guildId, true);
      return message.reply('✅ Premium Activated! ⭐');
    }
    return message.reply('❌ Wrong code');
  }
});

client.login(token);