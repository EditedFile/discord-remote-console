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
	.setName("setup")
	.setDescription("Setup Discord SSH Bot channels and category")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	try {
		await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

		const guild = interaction.guild;
		
		let category = guild.channels.cache.find(
			c => c.type === ChannelType.GuildCategory && c.name === "DISCORD SSH BOT"
		);

		if (!category) {
			category = await guild.channels.create({
				name: "DISCORD SSH BOT",
				type: ChannelType.GuildCategory,
			});
			Logger("event", `Created category: DISCORD SSH BOT`);
		}

		let mainTerminal = guild.channels.cache.find(
			c => c.name === "main-terminal" && c.parentId === category.id
		);

		if (!mainTerminal) {
			mainTerminal = await guild.channels.create({
				name: "main-terminal",
				type: ChannelType.GuildText,
				parent: category.id,
				topic: "Main terminal for SSH commands",
			});
			Logger("event", `Created channel: main-terminal`);
		}

		config.channel = mainTerminal.id;
		config.category_id = category.id;

		try {
			const { stdout } = await execPromise("screen -ls");
			const sessionRegex = /(\d+\.\S+)/g;
			const sessions = stdout.match(sessionRegex);

			if (sessions && sessions.length > 0) {
				for (const session of sessions) {
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
						Logger("event", `Created channel: ${channelName} for session ${session}`);
					}

					const logFile = `/tmp/screen_${session}.log`;
					
					execPromise(`screen -r ${session} -X logfile ${logFile}`).catch(() => {});
					execPromise(`screen -r ${session} -X log on`).catch(() => {});
					execPromise(`touch ${logFile}`).then(() => {
						setTimeout(() => {
							if (existsSync(logFile)) {
								const startEmbed = new EmbedBuilder()
									.setColor(config.color)
									.setDescription(`📡 Started logging for screen session: \`${session}\``);
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
				}

				const embed = new EmbedBuilder()
					.setColor(config.color)
					.setTitle("Setup Complete")
					.setDescription(
						`Category: \`DISCORD SSH BOT\`\n` +
						`Main Terminal: <#${mainTerminal.id}>\n` +
						`Screen Sessions: \`${sessions.length}\` channels created\n\n` +
						`**Active Sessions:**\n${sessions.map(s => `• \`${s}\``).join("\n")}\n\n` +
						`Log monitoring started for all sessions`
					)
					.setFooter({
						text: "discord-ssh",
						iconURL: interaction.client.user.displayAvatarURL()
					})
					.setTimestamp();

				await interaction.editReply({
					embeds: [embed]
				});
			} else {
				const embed = new EmbedBuilder()
					.setColor(config.color)
					.setTitle("Setup Complete")
					.setDescription(
						`Category: \`DISCORD SSH BOT\`\n` +
						`Main Terminal: <#${mainTerminal.id}>\n` +
						`Screen Sessions: \`0\` (no active sessions found)`
					)
					.setFooter({
						text: "discord-ssh",
						iconURL: interaction.client.user.displayAvatarURL()
					})
					.setTimestamp();

				await interaction.editReply({
					embeds: [embed]
				});
			}
		} catch (error) {
			const embed = new EmbedBuilder()
				.setColor(config.color)
				.setTitle("Setup Complete")
				.setDescription(
					`Category: \`DISCORD SSH BOT\`\n` +
					`Main Terminal: <#${mainTerminal.id}>\n` +
					`Screen Sessions: \`0\` (no active sessions found)`
				)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			await interaction.editReply({
				embeds: [embed]
			});
		}
	} catch (error) {
		Logger("error", `Error in setup command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245) // Red color
			.setTitle("Setup Error")
			.setDescription(`An error occurred during setup:\n\`\`\`${error.message}\`\`\``)
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
