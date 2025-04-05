import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Role,
  TextChannel,
  User,
  MessageFlags,
} from "discord.js";
import dotenv from "dotenv";
import { readData, writeData, ActiveUser } from "./storage/data.js";
import { scheduleChecks } from "./scheduler.js";

dotenv.config();

const token = process.env.DISCORD_TOKEN!;
const clientId = process.env.CLIENT_ID!;
const guildId = process.env.GUILD_ID!;
const activeRoleId = process.env.ACTIVE_ROLE_ID!;

if (!token || !clientId || !guildId || !activeRoleId) {
  throw new Error("Missing required environment variables");
}

function formatDuration(joinedAt: string): string {
  const now = new Date();
  const joined = new Date(joinedAt);
  const diffMs = now.getTime() - joined.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHrs = Math.floor(diffMin / 60);
  return `${diffHrs} hr${diffHrs === 1 ? "" : "s"} ago`;
}

function utcTime(): string {
  return new Date().toISOString().split("T")[1].split(".")[0] + " UTC";
}

const commands = [
  new SlashCommandBuilder()
    .setName("active")
    .setDescription("Manage activity")
    .addSubcommand((sub) =>
      sub
        .setName("join")
        .setDescription("Join the active list")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("leave")
        .setDescription("Leave the active list")
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Target user"),
        ),
    )
    .addSubcommand((sub) =>
      sub.setName("yes").setDescription("Confirm you're still active"),
    )
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("Show current active list"),
    ),
].map((cmd) => cmd.toJSON());

const rest = new REST({ version: "10" }).setToken(token);
(async () => {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), {
    body: commands,
  });
})();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", () => {
  console.log(`Logged in as ${client.user!.tag}`);
  scheduleChecks(client);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const data = readData();
  const sub = interaction.options.getSubcommand();
  const target = interaction.options.getUser("user") || interaction.user;

  if (interaction.commandName === "active") {
    let member;
    try {
      member = await interaction.guild!.members.fetch(target.id);
    } catch {
      return interaction.reply({
        content: "Couldn't find that user in the server.",
        ephemeral: true,
      });
    }

    if (sub === "join") {
      data[target.id] = {
        status: "active",
        joinedAt: new Date().toISOString(),
        pendingCheck: false,
      };
      await member.roles.add(activeRoleId);
      writeData(data);
      await interaction.reply(`<@${target.id}> is now active!`);
    } else if (sub === "leave") {
      delete data[target.id];
      await member.roles.remove(activeRoleId);
      writeData(data);
      await interaction.reply(`<@${target.id}> has left the active list.`);
    } else if (sub === "yes") {
      if (data[target.id]) {
        data[target.id].status = "active";
        data[target.id].joinedAt = new Date().toISOString();
        data[target.id].pendingCheck = false;
        writeData(data);
        await interaction.reply(`<@${target.id}> is marked as active again.`);
      } else {
        await interaction.reply({
          content: `You're not on the active list.`,
          ephemeral: true,
        });
      }
    } else if (sub === "list") {
      const time = utcTime();
      const lines = Object.entries(data).map(([id, user]) => {
        const mark = user.status === "inactive" ? "❌" : "✅";
        return `${mark} <@${id}> — ${user.status.toUpperCase()} (${formatDuration(user.joinedAt)}, ${time})`;
      });
      await interaction.reply({
        content: lines.join("\n") || "No one is active.",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
});

client.login(token);

async function unregisterCommands() {
  try {
    const cmds = (await rest.get(
      Routes.applicationGuildCommands(clientId, guildId),
    )) as any[];

    for (const cmd of cmds) {
      await rest.delete(
        Routes.applicationGuildCommand(clientId, guildId, cmd.id),
      );
      console.log(`Unregistered command: ${cmd.name}`);
    }
  } catch (err) {
    console.error("Error unregistering commands:", err);
  }
}

function gracefulShutdown() {
  console.log("Shutting down bot, unregistering commands...");
  unregisterCommands().finally(() => {
    process.exit(0);
  });
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);
