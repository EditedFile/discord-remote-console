import { exec } from "child_process";
import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import { promisify } from "util";
import { config } from "../config.js";
import { Logger } from "../utils/logger.js";

const execPromise = promisify(exec);

export const data = new SlashCommandBuilder()
	.setName("unsetup")
	.setDescription("Remove Discord SSH Bot category and stop all logging")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	try {
		await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

		const guild = interaction.guild;
		
		const category = guild.channels.cache.find(
			c => c.type === ChannelType.GuildCategory && c.name === "DISCORD SSH BOT"
		);

		if (!category) {
			const embed = new EmbedBuilder()
				.setColor(0xFEE75C) // Yellow color
				.setTitle("Nothing to Remove")
				.setDescription("The `DISCORD SSH BOT` category doesn't exist.")
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [embed]
			});
		}

		const channelsToDelete = guild.channels.cache.filter(
			c => c.parentId === category.id
		);

		const channelCount = channelsToDelete.size;
		let deletedCount = 0;

		try {
			const { stdout } = await execPromise("screen -ls");
			const sessionRegex = /(\d+\.\S+)/g;
			const sessions = stdout.match(sessionRegex);

			if (sessions && sessions.length > 0) {
				for (const session of sessions) {
					try {
						await execPromise(`screen -r ${session} -X log off`);
						Logger("event", `Stopped logging for session: ${session}`);
					} catch (error) {
					}
				}
			}
		} catch (error) {
		}

		for (const [, channel] of channelsToDelete) {
			try {
				await channel.delete();
				deletedCount++;
				Logger("event", `Deleted channel: ${channel.name}`);
			} catch (error) {
				Logger("error", `Failed to delete channel ${channel.name}: ${error}`);
			}
		}

		try {
			await category.delete();
			Logger("event", `Deleted category: DISCORD SSH BOT`);
		} catch (error) {
			Logger("error", `Failed to delete category: ${error}`);
		}

		config.channel = null;
		config.category_id = null;

		const embed = new EmbedBuilder()
			.setColor(config.color)
			.setTitle("Unsetup Complete")
			.setDescription(
				`Category: \`DISCORD SSH BOT\` removed\n` +
				`Channels Deleted: \`${deletedCount}\` of \`${channelCount}\`\n` +
				`Logging stopped for all screen sessions`
			)
			.setFooter({
				text: "discord-ssh",
				iconURL: interaction.client.user.displayAvatarURL()
			})
			.setTimestamp();

		await interaction.editReply({
			embeds: [embed]
		});
	} catch (error) {
		Logger("error", `Error in unsetup command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245) // Red color
			.setTitle("Unsetup Error")
			.setDescription(`An error occurred during unsetup:\n\`\`\`${error.message}\`\`\``)
			.setFooter({
				text: "discord-ssh",
				iconURL: interaction.client.user.displayAvatarURL()
			})
			.setTimestamp();

		if (interaction.deferred) {
			await interaction.editReply({
				embeds: [errorEmbed]
			});
		} else {
			await interaction.reply({
				embeds: [errorEmbed],
				flags: 64
			});
		}
	}
}
