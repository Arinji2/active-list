import { Client, TextChannel } from "discord.js";
import { readData, writeData } from "./storage/data.js";

interface ActiveUser {
  status: "active" | "inactive";
  joinedAt: string;
  pendingCheck: boolean;
}

export function scheduleChecks(client: Client) {
  const intervalHours = parseInt(process.env.CHECK_INTERVAL_HOURS || "4");
  const checkChannelId = process.env.CHECK_CHANNEL_ID!;
  const ms = intervalHours * 60 * 60 * 1000;

  setInterval(async () => {
    const data: Record<string, ActiveUser> = readData();
    const channel = (await client.channels.fetch(
      checkChannelId,
    )) as TextChannel;

    for (const [userId, user] of Object.entries(data)) {
      if (user.status === "active") {
        user.status = "inactive";
        user.pendingCheck = true;
        await channel.send(
          `<@${userId}> are you still active? Reply with /active yes within 1 hour!`,
        );
      }
    }

    writeData(data);

    // cleanup inactive after 1 hour
    setTimeout(
      () => {
        const updated: Record<string, ActiveUser> = readData();
        for (const [userId, user] of Object.entries(updated)) {
          if (user.pendingCheck) {
            user.status = "inactive";
          }
        }
        writeData(updated);
      },
      60 * 60 * 1000,
    );
  }, ms);
}
