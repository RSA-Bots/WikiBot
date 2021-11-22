import { ApplicationCommandData, Client, Guild, Intents, MessageEmbed } from "discord.js";
import { readFileSync } from "fs";
import { get } from "https";

interface IData {
	token: string;
	rsaSource: string;
	apiPrefix: string;
	apiSuffix: string;
}

interface IRange {
	min: number;
	max: number;
}

interface RobloxMasterResult {
	record_count: number;
	records: { [index: string]: RobloxMasterResultRecord[] };
}

interface RobloxMasterResultRecord {
	url: string;
	summary: string;
	category: string;
	display_title: string;
	segment: string;
	api_type: string;
	body: string;
	_score: number;
	highlight: {
		body: string;
	};
}

interface RSAResult {
	url: string;
	title: string;
	excerpt: string;
	content: string;
	author: string;
}

type RSACategory = [RSAResult];
type EmbedTrack = { messageId: string; channelId: string };
type EmbedList = { [index: string]: EmbedTrack };

const slash_command_wiki: ApplicationCommandData = {
	name: "wiki",
	description: "Search Roblox's Developer Hub.",
	options: [
		{
			type: "STRING",
			name: "query",
			description: "The query to search for.",
			required: true,
		},
		{
			type: "INTEGER",
			name: "page",
			description: "The specified results page, if applicable.",
		},
	],
};

const slash_command_rsa: ApplicationCommandData = {
	name: "rsa_article",
	description: "Retrieve an article from the RSA site.",
	options: [
		{
			type: "SUB_COMMAND",
			name: "author",
			description: "Retrieve articles by author.",
			options: [
				{
					type: "STRING",
					name: "authorquery",
					description: "The author name.",
					required: true,
				},
				{
					type: "INTEGER",
					name: "page",
					description: "The specified results page, if applicable.",
				},
			],
		},
		{
			type: "SUB_COMMAND",
			name: "title",
			description: "Retrieve articles by title.",
			options: [
				{
					type: "STRING",
					name: "titlequery",
					description: "The title.",
					required: true,
				},
				{
					type: "INTEGER",
					name: "page",
					description: "The specified results page, if applicable.",
				},
			],
		},
	],
};

const slash_command_select: ApplicationCommandData = {
	name: "select",
	description: "Update your most recent embed.",
	options: [
		{
			type: "SUB_COMMAND",
			name: "result",
			description: "Updates your most recent embed to display a result.",
			options: [
				{
					type: "INTEGER",
					name: "index",
					description: "The index of the result to select if one has not already been selected.",
					required: true,
				},
			],
		},
		{
			type: "SUB_COMMAND",
			name: "page",
			description: "Updates your most recent embed to the page selected.",
			options: [
				{
					type: "INTEGER",
					name: "index",
					description: "The page to jump to.",
					required: true,
				},
			],
		},
	],
};

function setupGuild(guild: Guild): void {
	const commands = guild.commands;

	commands.set([slash_command_wiki, slash_command_rsa, slash_command_select]).catch(console.error.bind(console));
}

try {
	const data = JSON.parse(readFileSync("data2.json", "utf-8")) as IData;

	if (data.token.length === 0) {
		throw new Error("Invalid token provided. Please be sure that `token.json` contains your bot token.");
	}

	let rsaData = "";

	let sourceRSA: RSACategory;

	const embedTrack: EmbedList = {};

	console.log("Building rsaData started.");
	get(data.rsaSource, res => {
		res.on("data", d => {
			rsaData += d;
		});

		res.on("end", () => {
			console.log("Building rsaData completed.");
			sourceRSA = JSON.parse(rsaData) as RSACategory;

			const client = new Client({
				intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MEMBERS],
			});

			client.once("ready", () => {
				console.log("Client logged in.");

				client.guilds
					.fetch()
					.then(oauthGuilds => {
						oauthGuilds.forEach(guildPreview => {
							guildPreview.fetch().then(setupGuild).catch(console.error.bind(console));
						});
					})
					.catch(console.error.bind(console));
			});

			client.on("guildCreate", setupGuild);

			client.on("interactionCreate", async interaction => {
				if (interaction.isCommand()) {
					if (interaction.commandName === "wiki") {
						await interaction.deferReply();

						const query = interaction.options["_hoistedOptions"][0].value as string;
						let page = 1;

						if (interaction.options["_hoistedOptions"][1]) {
							page = interaction.options["_hoistedOptions"][1].value as number;
						}

						if (!query) await interaction.editReply("Invalid query received.");

						let searchQuery = query;
						while (searchQuery.includes(".")) {
							searchQuery = searchQuery.replace(".", "");
						}

						const resultEmbed: MessageEmbed = new MessageEmbed();
						const robloxResult = `${data.apiPrefix}${searchQuery}${data.apiSuffix}`;
						let fetchedData = "";
						let masterResult: RobloxMasterResult;

						get(robloxResult, res => {
							res.on("data", d => {
								fetchedData += d;
							});

							res.on("end", () => {
								fetchedData = fetchedData.slice(46, fetchedData.length - 1);
								masterResult = JSON.parse(fetchedData) as RobloxMasterResult;

								let masterRecordList: RobloxMasterResultRecord[] = [];

								Object.entries(masterResult.records).forEach(
									([, records]: [string, RobloxMasterResultRecord[]]) =>
										Object.values(records).find(record => {
											if (record.url.includes("en-us") && record.display_title.length > 0)
												masterRecordList.push(record);
										})
								);

								masterRecordList = masterRecordList.sort((a, b) => (a._score < b._score ? 1 : -1));

								if (masterRecordList.length > 0) {
									const matchingRecord = masterRecordList.find(record => {
										if (record.display_title) {
											return record.display_title.toLowerCase() === query.toLowerCase();
										}
									});

									if (matchingRecord) {
										let display = matchingRecord.summary;
										if (!display || display.length === 0) {
											if (matchingRecord.body) {
												display = matchingRecord.body.slice(0, 100);
											}

											if (matchingRecord.highlight) {
												if (matchingRecord.highlight.body) {
													display = matchingRecord.highlight.body.slice(0, 100);
												}
											}
										}

										if (display.length === 0) display = "No description found.";

										resultEmbed.setTitle(matchingRecord.display_title);
										resultEmbed.setURL(matchingRecord.url);
										resultEmbed.addField("\u200b", display, false);
									} else {
										if (page > Math.floor(masterRecordList.length / 5)) {
											page = Math.floor(masterRecordList.length / 5);

											if (
												Math.floor(masterRecordList.length / 5) !=
												Math.ceil(masterRecordList.length / 5)
											) {
												page += 1;
											}
										}

										console.log(page);

										const range: IRange = { min: (page - 1) * 5, max: page * 5 };

										console.log(range);

										resultEmbed.setTitle(`Results for: ${query}`);
										resultEmbed.addField(
											"\u200b",
											masterRecordList
												.slice(range.min, range.max)
												.map(record => {
													return `[${
														record.category.length > 0
															? record.category
															: record.api_type.length > 0
															? record.api_type
															: "Articles"
													}] [${record.display_title}](${record.url})`;
												})
												.join("\n"),
											true
										);
										resultEmbed.setFooter(
											`Total Results: ${masterRecordList.length} | Showing Results: ${
												range.min + 1
											} - ${Math.min(range.max, masterRecordList.length)}\nPage: ${page}`
										);
									}
								} else {
									resultEmbed.setTitle("Sad days...");
									resultEmbed.addField("\u200b", "Zero Results Found", false);
								}

								interaction
									.editReply({
										embeds: [resultEmbed],
									})
									.then(message => {
										embedTrack[interaction.user.id] = {
											messageId: message.id,
											channelId: interaction.channelId,
										};
									})
									.catch(console.error.bind(console));
							});
						});
					} else if (interaction.commandName === "rsa_article") {
						const subCommand = interaction.options["_subcommand"];
						const query = String(interaction.options["_hoistedOptions"][0].value);
						let page = 1;

						if (interaction.options["_hoistedOptions"][1]) {
							page = interaction.options["_hoistedOptions"][1].value as number;
						}

						if (!query)
							return interaction.reply({
								ephemeral: true,
								content: "No query provided. Please try again.",
							});

						const result: RSAResult[] = [];
						const range: IRange = { min: 0, max: 5 };

						if (subCommand != "author" && subCommand != "title")
							return interaction.reply({
								ephemeral: true,
								content: "Invalid subcommand provided. Please try again.",
							});

						sourceRSA.forEach(article => {
							const field = subCommand === "author" ? article.author : article.title;

							if (
								field.toLowerCase() === query.toLowerCase() ||
								field.toLowerCase().includes(query.toLowerCase())
							) {
								result.push(article);
							}
						});

						if (page > Math.floor(result.length / 5)) {
							page = Math.floor(result.length / 5);

							if (Math.floor(result.length / 5) != Math.ceil(result.length / 5)) {
								page += 1;
							}
						}

						range.min = (page - 1) * 5;
						range.max = page * 5;

						if (result.length === 0) {
							await interaction.reply({
								ephemeral: true,
								content: "0 results found.",
							});
						} else if (result.length === 1) {
							await interaction.reply({
								embeds: [
									new MessageEmbed()
										.setTitle(result[0].title)
										.setDescription(result[0].author)
										.addField("\u200b", result[0].excerpt, true)
										.setURL(`https://resources.robloxscriptassistance.org${result[0].url}`),
								],
							});
						} else {
							await interaction.reply({
								embeds: [
									new MessageEmbed()
										.setTitle(
											`${subCommand === "author" ? "Author" : "Title"} Results for: ${query}`
										)
										.setDescription(`Page: ${page}`)
										.addField(
											"\u200b",
											result
												.slice(range.min, range.max)
												.map(res => {
													return `[${res.title}](https://resources.robloxscriptassistance.org${res.url}) - ${res.author}`;
												})
												.join("\n"),
											true
										)
										.setFooter(
											`Total Results: ${result.length} | Showing Results: ${
												range.min + 1
											} - ${Math.min(range.max, result.length)}\nPage: ${page}`
										),
								],
							});
						}
					} else if (interaction.commandName === "select") {
						const guild = interaction.guild;

						if (!guild)
							return interaction.reply({
								ephemeral: true,
								content: "No guild received. Please try again.",
							});

						const subCommand = interaction.options["_subcommand"];
						const index = interaction.options["_hoistedOptions"][0].value as number;

						if (!index)
							return interaction.reply({
								ephemeral: true,
								content: "No index provided. Please try again.",
							});

						const messageData: EmbedTrack = embedTrack[interaction.user.id];

						if (messageData.messageId.length === 0 || messageData.channelId.length === 0)
							return interaction.reply({
								ephemeral: true,
								content: "No previous, or valid, embed to interact on. Please try again.",
							});

						guild.channels
							.fetch(messageData.channelId)
							.then(channel => {
								if (channel && channel.isText()) {
									channel.messages
										.fetch(messageData.messageId)
										.then(message => {
											if (message && message.embeds.length > 0) {
												if (subCommand === "result") {
													const embed = message.embeds[0];

													if (embed) {
														const results = embed.fields[0];

														if (results) {
															const indecies: string[] = results.value.split("\n");

															if (indecies.length < index) {
																return interaction.reply({
																	ephemeral: true,
																	content:
																		"Invalid index provided. Please try again.",
																});
															}

															const result = indecies[index - 1];
															let dataParse = result;
															const firstSquare = dataParse.indexOf("[") + 1;
															dataParse = dataParse.substr(firstSquare);
															const secondSquare = dataParse.indexOf("[") + 1;
															dataParse = dataParse.substr(
																secondSquare,
																dataParse.length - 1
															);

															const query = dataParse.split("](");
															let searchQuery = query[0];
															const propertySplit = searchQuery.indexOf(".");
															if (propertySplit) {
																searchQuery = searchQuery.substr(propertySplit);
															}

															console.log(query[1]);
															const robloxResult = `${data.apiPrefix}${searchQuery}${data.apiSuffix}`;
															let selectedResult = "";
															let masterResult: RobloxMasterResult;

															get(robloxResult, res => {
																res.on("data", d => {
																	selectedResult += d;
																});

																res.on("end", () => {
																	selectedResult = selectedResult.slice(
																		46,
																		selectedResult.length - 1
																	);
																	masterResult = JSON.parse(
																		selectedResult
																	) as RobloxMasterResult;

																	const masterRecordList: RobloxMasterResultRecord[] =
																		[];

																	Object.entries(masterResult.records).forEach(
																		([, records]: [
																			string,
																			RobloxMasterResultRecord[]
																		]) =>
																			Object.values(records).find(record => {
																				if (
																					record.url === query[1] ||
																					record.display_title === query[0]
																				)
																					masterRecordList.push(record);
																			})
																	);

																	console.log(masterRecordList);

																	const matchingRecord = masterRecordList[0];

																	let display = matchingRecord.summary;
																	if (!display || display.length === 0) {
																		if (matchingRecord.body) {
																			display = matchingRecord.body.slice(0, 100);
																		}

																		if (matchingRecord.highlight) {
																			if (matchingRecord.highlight.body) {
																				display =
																					matchingRecord.highlight.body.slice(
																						0,
																						100
																					);
																			}
																		}
																	}

																	if (display.length === 0)
																		display = "No description found.";

																	const resultEmbed: MessageEmbed =
																		new MessageEmbed();

																	resultEmbed.setTitle(matchingRecord.display_title);
																	resultEmbed.setURL(matchingRecord.url);
																	resultEmbed.addField("\u200b", display, false);

																	message
																		.edit({ embeds: [resultEmbed] })
																		.catch(console.error.bind(console));

																	interaction
																		.reply({
																			ephemeral: true,
																			content: "Successfully selected result.",
																		})
																		.then(() => {
																			embedTrack[interaction.user.id] = {
																				messageId: "",
																				channelId: "",
																			};
																		})
																		.catch(console.error.bind(console));
																});
															}).on("error", console.error.bind(console));

															console.log(query);
														}
													}
												} else {
													return interaction.reply({
														ephemeral: true,
														content: "NYI - page selection",
													});
												}
											} else {
												embedTrack[interaction.user.id] = { messageId: "", channelId: "" };
												return interaction.reply({
													ephemeral: true,
													content: "Invalid messageData received. Please try again.",
												});
											}
										})
										.catch(console.error.bind(console));
								}
							})
							.catch(console.error.bind(console));
					} else {
						await interaction.reply({
							ephemeral: true,
							content: "Invalid interactionData received.",
						});
					}
				}
			});

			console.log("Logging in.");

			client.login(data.token).catch(console.error.bind(console));
		});
	}).on("error", console.error.bind(console));
} catch (e) {
	console.error(e);
}
