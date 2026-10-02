const { Client, GatewayIntentBits, AuditLogEvent, EmbedBuilder, REST, Routes } = require('discord.js');

const token = process.env.token;
const ownerId = process.env.ownerId;
const logChannelId = process.env.logChannelId;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const CONFIG = {
  enabled: true,
  whitelist: [ownerId],
  punishment: 'ban',
  thresholds: { bans: 3, kicks: 3, channels: 3, roles: 3, webhooks: 2 },
  timeWindow: 10000
};

const tracker = new Map();

const commands = [
  {
    name: 'antinuke',
    description: 'Control Anti-Nuke system',
    options: [
      { name: 'action', type: 3, required: true, choices: [
        { name: 'Enable', value: 'enable' },
        { name: 'Disable', value: 'disable' },
        { name: 'Status', value: 'status' }
      ]}
    ]
  },
  {
    name: 'whitelist',
    description: 'Manage whitelisted users',
    options: [
      { name: 'action', type: 3, required: true, choices: [
        { name: 'Add', value: 'add' },
        { name: 'Remove', value: 'remove' },
        { name: 'List', value: 'list' }
      ]},
      { name: 'user', type: 6, description: 'User to add/remove' }
    ]
  },
  {
    name: 'limit',
    description: 'Set trigger thresholds',
    options: [
      { name: 'type', type: 3, required: true, choices: [
        { name: 'Bans', value: 'bans' },
        { name: 'Kicks', value: 'kicks' },
        { name: 'Channels', value: 'channels' },
        { name: 'Roles', value: 'roles' },
        { name: 'Webhooks', value: 'webhooks' }
      ]},
      { name: 'count', type: 4, description: 'Max number before trigger', required: true }
    ]
  },
  {
    name: 'punishment',
    description: 'Set what happens to attackers',
    options: [
      { name: 'action', type: 3, required: true, choices: [
        { name: 'Ban', value: 'ban' },
        { name: 'Kick', value: 'kick' },
        { name: 'Derank', value: 'derank' }
      ]}
    ]
  }
];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('🔄 Registering commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commands registered!');
  } catch (e) { console.error(e); }
}

function isOverLimit(userId, actionType) {
  if (!tracker.has(userId)) tracker.set(userId, []);
  const actions = tracker.get(userId).filter(a => Date.now() - a.time < CONFIG.timeWindow);
  actions.push({ type: actionType, time: Date.now() });
  tracker.set(userId, actions);
  return actions.filter(a => a.type === actionType).length >= CONFIG.thresholds[actionType];
}

async function punish(guild, executorId, reason) {
  if (!CONFIG.enabled || CONFIG.whitelist.includes(executorId)) return false;
  const member = await guild.members.fetch(executorId).catch(() => null);
  if (!member) return false;
  if (member.roles.highest.position >= guild.members.me.roles.highest.position) return false;
  try {
    switch (CONFIG.punishment) {
      case 'ban': await member.ban({ reason }); break;
      case 'kick': await member.kick(reason); break;
      case 'derank': await member.roles.set([], reason); break;
    }
    return true;
  } catch { return false; }
}

async function sendLog(guild, executorId, actionType) {
  const channel = await client.channels.fetch(logChannelId).catch(() => null);
  if (!channel) return;
  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle('🚨 ANTI-NUKE TRIGGERED')
        .addFields(
          { name: 'User', value: `<@${executorId}> (${executorId})` },
          { name: 'Action', value: actionType.toUpperCase() },
          { name: 'Punishment', value: CONFIG.punishment.toUpperCase() }
        )
        .setColor('Red')
        .setTimestamp()
    ]
  });
}

client.on('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await registerCommands();
  console.log(`🛡️ Anti-Nuke active — type / in Discord to see commands!`);
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.user.id !== ownerId) return interaction.reply({ content: '❌ Only owner can use this!', ephemeral: true });
  const { commandName, options } = interaction;
  if (commandName === 'antinuke') {
    const action = options.getString('action');
    if (action === 'enable') { CONFIG.enabled = true; await interaction.reply('✅ Anti-Nuke **ENABLED**'); }
    if (action === 'disable') { CONFIG.enabled = false; await interaction.reply('⚠️ Anti-Nuke **DISABLED**'); }
    if (action === 'status') {
      await interaction.reply(`
**🛡️ Anti-Nuke Status:** ${CONFIG.enabled ? '✅ ACTIVE' : '❌ DISABLED'}
**Punishment:** ${CONFIG.punishment}
**Limits:** Bans:${CONFIG.thresholds.bans} Kicks:${CONFIG.thresholds.kicks} Channels:${CONFIG.thresholds.channels} Roles:${CONFIG.thresholds.roles} Webhooks:${CONFIG.thresholds.webhooks}
**Whitelisted:** ${CONFIG.whitelist.length} users
      `);
    }
  }
  if (commandName === 'whitelist') {
    const action = options.getString('action');
    const user = options.getUser('user');
    if (action === 'add' && user) {
      if (!CONFIG.whitelist.includes(user.id)) CONFIG.whitelist.push(user.id);
      await interaction.reply(`✅ Added ${user} to whitelist`);
    }
    if (action === 'remove' && user) {
      CONFIG.whitelist = CONFIG.whitelist.filter(id => id !== user.id);
      await interaction.reply(`✅ Removed ${user} from whitelist`);
    }
    if (action === 'list') {
      const list = CONFIG.whitelist.map(id => `<@${id}>`).join(', ') || 'None';
      await interaction.reply(`**Whitelisted Users:**\n${list}`);
    }
  }
  if (commandName === 'limit') {
    const type = options.getString('type');
    const count = options.getInteger('count');
    CONFIG.thresholds[type] = count;
    await interaction.reply(`✅ Set **${type}** limit to ${count}`);
  }
  if (commandName === 'punishment') {
    const action = options.getString('action');
    CONFIG.punishment = action;
    await interaction.reply(`✅ Punishment set to **${action}**`);
  }
});

client.on('guildAuditLogEntryCreate', async entry => {
  if (!CONFIG.enabled) return;
  const { action, executorId, guild } = entry;
  if (!executorId || executorId === client.user.id) return;
  let actionType = null;
  if (action === AuditLogEvent.MEMBER_BAN_ADD) actionType = 'bans';
  if (action === AuditLogEvent.MEMBER_KICK) actionType = 'kicks';
  if ([AuditLogEvent.CHANNEL_CREATE, AuditLogEvent.CHANNEL_DELETE].includes(action)) actionType = 'channels';
  if ([AuditLogEvent.ROLE_CREATE, AuditLogEvent.ROLE_DELETE].includes(action)) actionType = 'roles';
  if (action === AuditLogEvent.WEBHOOK_CREATE) actionType = 'webhooks';
  if (!actionType) return;
  if (isOverLimit(executorId, actionType)) {
    const applied = await punish(guild, executorId, `Anti-Nuke: ${actionType} limit exceeded`);
    if (applied) await sendLog(guild, executorId, actionType);
  }
});

client.login(token);
