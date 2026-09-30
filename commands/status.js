import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";
import si from "systeminformation";
import { config } from "../config.js";
import { Logger } from "../utils/logger.js";

function bar(percent, length = 12) {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * length);
	return "█".repeat(filled) + "░".repeat(length - filled);
}

function formatGB(bytes) {
	return (bytes / 1024 ** 3).toFixed(1);
}

function formatUptime(seconds) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	const parts = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	parts.push(`${minutes}m`);
	return parts.join(" ");
}

export const data = new SlashCommandBuilder()
	.setName("status")
	.setDescription("Show system status (CPU, memory, disk, uptime)")
	.setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

export async function execute(interaction) {
	try {
		if (interaction.channelId !== config.channel) {
			const embed = new EmbedBuilder()
				.setColor(0xFEE75C)
				.setTitle("Wrong Channel")
				.setDescription(`This command can only be used in the <#${config.channel}> channel.`)
				.setFooter({
					text: "discord-ssh",
					iconURL: interaction.client.user.displayAvatarURL()
				})
				.setTimestamp();

			return await interaction.reply({
				embeds: [embed],
				flags: 64
			});
		}

		await interaction.deferReply({ flags: 64 });

		const [os, cpu, load, mem, disks, time] = await Promise.all([
			si.osInfo(),
			si.cpu(),
			si.currentLoad(),
			si.mem(),
			si.fsSize(),
			si.time()
		]);

		const cpuPercent = load.currentLoad;
		const memPercent = (mem.active / mem.total) * 100;

		const realDisks = disks
			.filter(d => d.size > 0 && d.fs.startsWith("/dev/") && !d.fs.startsWith("/dev/loop"))
			.sort((a, b) => {
				if (a.mount === "/") return -1;
				if (b.mount === "/") return 1;
				return a.mount.localeCompare(b.mount);
			})
			.slice(0, 5);

		const warning = cpuPercent > 90 || memPercent > 90 || realDisks.some(d => d.use > 90);

		const cpuName = `${cpu.manufacturer} ${cpu.brand}`.replace(/\s+/g, " ").trim();

		const diskLines = realDisks.map(d =>
			`\`${d.mount}\` \`${bar(d.use)}\` \`${formatGB(d.used)} / ${formatGB(d.size)} GB (${d.use.toFixed(0)}%)\``
		);

		const embed = new EmbedBuilder()
			.setColor(warning ? 0xFEE75C : config.color)
			.setTitle("System Status")
			.addFields(
				{
					name: "System",
					value: `${os.distro} ${os.release} ${os.arch}\nKernel \`${os.kernel}\`\nHost \`${os.hostname}\``,
					inline: false
				},
				{
					name: "CPU",
					value: `${cpuName}\n\`${bar(cpuPercent)}\` \`${cpuPercent.toFixed(1)}% (${cpu.cores} threads @ ${cpu.speed} GHz)\``,
					inline: false
				},
				{
					name: "Memory",
					value: `\`${bar(memPercent)}\` \`${formatGB(mem.active)} / ${formatGB(mem.total)} GB (${memPercent.toFixed(1)}%)\``,
					inline: false
				},
				{
					name: "Disks",
					value: diskLines.length > 0 ? diskLines.join("\n") : "No disks found",
					inline: false
				},
				{
					name: "Uptime",
					value: `\`${formatUptime(time.uptime)}\``,
					inline: true
				}
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
		Logger("error", `Error in status command: ${error}`);
		const errorEmbed = new EmbedBuilder()
			.setColor(0xED4245)
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
