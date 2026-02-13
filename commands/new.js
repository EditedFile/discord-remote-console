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
	.setName("new")
	.setDescription("Create a new screen session with a Discord channel")
	.addStringOption(option =>
		option
			.setName("name")
			.setDescription("Name for the screen session")
			.setRequired(true)
	)
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	try {
		await interaction.deferReply({ flags: 64 }); // 64 = ephemeral flag

		const sessionName = interaction.options.getString("name");
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

		try {
			const { stdout } = await execPromise("screen -ls");
			const sessionRegex = new RegExp(`\\d+\\.${sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
			if (sessionRegex.test(stdout)) {
				const embed = new EmbedBuilder()
					.setColor(0xFEE75C) // Yellow color
					.setTitle("Session Already Exists")
					.setDescription(`A screen session with name \`${sessionName}\` already exists.\n\nUse \`/update\` to sync existing sessions.`)
					.setFooter({
						text: "discord-ssh",
						iconURL: interaction.client.user.displayAvatarURL()
					})
					.setTimestamp();

				return await interaction.editReply({
					embeds: [embed]
				});
			}
		} catch (error) {
		}

		try {
			await execPromise(`screen -dmS ${sessionName}`);
			Logger("event", `Created screen session: ${sessionName}`);
		} catch (error) {
			Logger("error", `Failed to create screen session: ${error}`);
			const errorEmbed = new EmbedBuilder()
				.setColor(0xED4245) // Red color
				.setTitle("Session Creation Failed")
				.setDescription(`Failed to create screen session \`${sessionName}\`\n\n**Error:**\n\`\`\`${error.message}\`\`\``)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.editReply({
				embeds: [errorEmbed]
			});
		}

		let fullSessionName = sessionName;
		try {
			const { stdout } = await execPromise("screen -ls");
			const sessionRegex = new RegExp(`(\\d+\\.${sessionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`);
			const match = stdout.match(sessionRegex);
			if (match) {
				fullSessionName = match[1];
			}
		} catch (error) {
		}

		const channelName = `screen-${fullSessionName.replace(/\./g, "")}`;
		let screenChannel = guild.channels.cache.find(
			c => c.name === channelName && c.parentId === category.id
		);

		if (!screenChannel) {
			screenChannel = await guild.channels.create({
				name: channelName,
				type: ChannelType.GuildText,
				parent: category.id,
				topic: fullSessionName,
			});
			Logger("event", `Created channel: ${channelName} for session ${fullSessionName}`);
		}

		const logFile = `/tmp/screen_${fullSessionName}.log`;
		
		execPromise(`screen -r ${fullSessionName} -X logfile ${logFile}`).catch(() => {});
		execPromise(`screen -r ${fullSessionName} -X log on`).catch(() => {});
		execPromise(`touch ${logFile}`).then(() => {
			setTimeout(() => {
				if (existsSync(logFile)) {
					const startEmbed = new EmbedBuilder()
						.setColor(config.color)
						.setDescription(`Started logging for screen session: \`${fullSessionName}\``);
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
								.setTitle(`Logs for session ${fullSessionName} (Page ${idx + 1}/${chunks.length})`)
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
								.setTitle(`Error in session ${fullSessionName} (Page ${idx + 1}/${chunks.length})`)
								.setDescription(codeBlock(chunk));
							screenChannel.send({
								embeds: [embed]
							}).catch(() => {});
						});
					});

					Logger("event", `Started log monitoring for session: ${fullSessionName}`);
				}
			}, 500);
		}).catch(() => {});

		const embed = new EmbedBuilder()
			.setColor(config.color)
			.setTitle("Session Created")
			.setDescription(
				`Screen session \`${fullSessionName}\` has been created.\n\n` +
				`Channel: <#${screenChannel.id}>\n` +
				`Log monitoring started`
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
		Logger("error", `Error in new command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245) // Red color
			.setTitle("Command Error")
			.setDescription(`An error occurred:\n\`\`\`${error.message}\`\`\``)
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
