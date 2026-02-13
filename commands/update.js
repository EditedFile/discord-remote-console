import { exec, spawn } from "child_process";
import { ChannelType, EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder, codeBlock } from "discord.js";
import { existsSync } from "fs";
import stripAnsi from "strip-ansi";
import { promisify } from "util";
import { config } from "../config.js";
import { chunkString } from "../utils/chunkString.js";
import { Logger } from "../utils/logger.js";

const execPromise = promisify(exec);

export const data = new SlashCommandBuilder()
	.setName("update")
	.setDescription("Sync screen sessions - create new channels and remove old ones")
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
				.setTitle("Setup Required")
				.setDescription("Please run `/setup` first to create the category.")
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [embed]
			});
		}

		let activeSessions = [];
		try {
			const { stdout } = await execPromise("screen -ls");
			const sessionRegex = /(\d+\.\S+)/g;
			activeSessions = stdout.match(sessionRegex) || [];
		} catch (error) {
		}

		const existingChannels = guild.channels.cache.filter(
			c => c.parentId === category.id && c.name.startsWith("screen-")
		);

		let created = 0;
		let deleted = 0;
		let kept = 0;

		for (const session of activeSessions) {
			const channelName = `screen-${session.replace(/\./g, "")}`;
			
			let screenChannel = guild.channels.cache.find(
				c => c.name === channelName && c.parentId === category.id
			);

			if (!screenChannel) {
				screenChannel = await guild.channels.create({
					name: channelName,
					type: ChannelType.GuildText,
					parent: category.id,
					topic: session,
				});
				created++;
				Logger("event", `Created channel: ${channelName} for session ${session}`);

				const logFile = `/tmp/screen_${session}.log`;
				
				execPromise(`screen -r ${session} -X logfile ${logFile}`).catch(() => {});
				execPromise(`screen -r ${session} -X log on`).catch(() => {});
				execPromise(`touch ${logFile}`).then(() => {
					setTimeout(() => {
						if (existsSync(logFile)) {
							const startEmbed = new EmbedBuilder()
								.setColor(config.color)
								.setDescription(`Started logging for screen session: \`${session}\``);
							screenChannel.send({
								embeds: [startEmbed]
							}).catch(() => {});

							const tailProcess = spawn("tail", ["-F", logFile]);
							
							tailProcess.stdout.on("data", (data) => {
								const logs = stripAnsi(data.toString());
								const chunks = chunkString(logs, 3000, []);
								chunks.forEach((chunk, idx) => {
									const embed = new EmbedBuilder()
										.setColor(config.color)
										.setTitle(`Logs for session ${session} (Page ${idx + 1}/${chunks.length})`)
										.setDescription(codeBlock(chunk));
									screenChannel.send({
										embeds: [embed]
									}).catch(() => {});
								});
							});

							tailProcess.stderr.on("data", (data) => {
								const logs = stripAnsi(data.toString());
								const chunks = chunkString(logs, 3000, []);
								chunks.forEach((chunk, idx) => {
									const embed = new EmbedBuilder()
										.setColor(config.color)
										.setTitle(`Error in session ${session} (Page ${idx + 1}/${chunks.length})`)
										.setDescription(codeBlock(chunk));
									screenChannel.send({
										embeds: [embed]
									}).catch(() => {});
								});
							});

							Logger("event", `Started log monitoring for session: ${session}`);
						}
					}, 500);
				}).catch(() => {});
			} else {
				kept++;
			}
		}

		for (const [, channel] of existingChannels) {
			const sessionFromTopic = channel.topic;
			const sessionFromName = channel.name.replace("screen-", "").replace(/(\d+)([A-Za-z]+)/, "$1.$2");
			const session = sessionFromTopic || sessionFromName;

			if (!activeSessions.includes(session)) {
				try {
					await execPromise(`screen -r ${session} -X log off`).catch(() => {});
					
					await channel.delete();
					deleted++;
					Logger("event", `Deleted channel: ${channel.name} (session no longer exists)`);
				} catch (error) {
					Logger("error", `Failed to delete channel ${channel.name}: ${error}`);
				}
			}
		}

		const embed = new EmbedBuilder()
			.setColor(config.color)
			.setTitle("Update Complete")
			.setDescription(
				`Channels Created: \`${created}\`\n` +
				`Channels Deleted: \`${deleted}\`\n` +
				`Channels Kept: \`${kept}\`\n` +
				`Total Active Sessions: \`${activeSessions.length}\`\n\n` +
				(activeSessions.length > 0 
					? `**Active Sessions:**\n${activeSessions.map(s => `• \`${s}\``).join("\n")}`
					: `No active screen sessions found`)
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
		Logger("error", `Error in update command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245) // Red color
			.setTitle("Update Error")
			.setDescription(`An error occurred during update:\n\`\`\`${error.message}\`\`\``)
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
