window.__ModuleLoader__.load({
	id: "dsh-processes-plugin",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/locales.ts
		const NS = "processes";
		const zh = { "view.processes": "进程" };
		const en = { "view.processes": "Processes" };
		//#endregion
		//#region src/client/index.tsx
		/**
		* 浏览器「进程」tab（会话视图槽 conversation.view）。
		* 数据经宿主 RPC 通道 `/processes` 获取（connection.rpc.call），列表每 3 秒刷新一次。
		*/
		const inject = [
			"connection",
			"slots",
			"locale"
		];
		const STATUS = {
			running: {
				label: "运行中",
				color: "#2563eb",
				background: "#eff6ff"
			},
			stopping: {
				label: "停止中",
				color: "#c2410c",
				background: "#fff7ed"
			},
			stopped: {
				label: "已停止",
				color: "#667085",
				background: "#f2f4f7"
			},
			completed: {
				label: "已完成",
				color: "#15803d",
				background: "#f0fdf4"
			},
			failed: {
				label: "异常退出",
				color: "#dc2626",
				background: "#fef2f2"
			}
		};
		function fmtTime(ms) {
			if (!ms) return "—";
			const d = new Date(ms);
			return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
		}
		function ProcessesView(props) {
			const [rows, setRows] = (0, react.useState)([]);
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [logFor, setLogFor] = (0, react.useState)(null);
			const [logText, setLogText] = (0, react.useState)("");
			const logRef = (0, react.useRef)(null);
			const logStickToBottom = (0, react.useRef)(true);
			const [showCreate, setShowCreate] = (0, react.useState)(false);
			const [command, setCommand] = (0, react.useState)("");
			const [name, setName] = (0, react.useState)("");
			const refresh = (0, react.useCallback)(async () => {
				try {
					setRows(await props.list() ?? []);
					setError("");
				} catch (err) {
					setError(err?.message ?? String(err));
				}
			}, [props.list]);
			(0, react.useEffect)(() => {
				refresh();
				const timer = setInterval(() => void refresh(), 3e3);
				return () => clearInterval(timer);
			}, [refresh]);
			const run = async (fn, after) => {
				setBusy(true);
				setError("");
				try {
					await fn();
					await refresh();
					if (after) after();
				} catch (err) {
					setError(err?.message ?? String(err));
				} finally {
					setBusy(false);
				}
			};
			(0, react.useEffect)(() => {
				if (logFor === null) return;
				let active = true;
				let timer;
				const refreshLog = async () => {
					try {
						const res = await props.output(logFor);
						if (active) setLogText(res?.output ?? "");
					} catch (err) {
						if (active) setLogText(err?.message ?? String(err));
					} finally {
						if (active) timer = setTimeout(() => void refreshLog(), 1e3);
					}
				};
				refreshLog();
				return () => {
					active = false;
					if (timer !== void 0) clearTimeout(timer);
				};
			}, [logFor, props.output]);
			(0, react.useLayoutEffect)(() => {
				if (logFor !== null && logStickToBottom.current && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
			}, [logFor, logText]);
			const showLog = (id) => {
				logStickToBottom.current = true;
				setLogFor(id);
				setLogText("");
			};
			const startCreate = async () => {
				if (!command.trim()) return;
				await run(() => props.start(command.trim(), name.trim() || void 0), () => {
					setCommand("");
					setName("");
					setShowCreate(false);
				});
			};
			const card = {
				fontFamily: "system-ui, -apple-system, \"Segoe UI\", sans-serif",
				padding: 16,
				color: "#1c2430"
			};
			const rowStyle = {
				display: "flex",
				alignItems: "center",
				gap: 10,
				padding: "10px 0",
				borderBottom: "1px solid #eef1f5"
			};
			const btn = {
				border: "1px solid #d5dbe3",
				background: "#fff",
				borderRadius: 6,
				padding: "4px 10px",
				fontSize: 12,
				cursor: "pointer"
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: card,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							marginBottom: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							style: {
								margin: 0,
								fontSize: 14
							},
							children: "进程"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								gap: 8
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: btn,
								onClick: () => void refresh(),
								children: "刷新"
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: btn,
								onClick: () => setShowCreate((v) => !v),
								children: "新建进程"
							})]
						})]
					}),
					error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: "#e74c3c",
							margin: "8px 0",
							fontSize: 13
						},
						children: error
					}) : null,
					showCreate ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							marginBottom: 12,
							display: "flex",
							gap: 8,
							flexWrap: "wrap"
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								placeholder: "命令，如 pnpm dev",
								value: command,
								onChange: (e) => setCommand(e.target.value),
								style: {
									flex: 2,
									minWidth: 200,
									padding: "6px 8px",
									border: "1px solid #d5dbe3",
									borderRadius: 6
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								placeholder: "名称（可选）",
								value: name,
								onChange: (e) => setName(e.target.value),
								style: {
									flex: 1,
									minWidth: 120,
									padding: "6px 8px",
									border: "1px solid #d5dbe3",
									borderRadius: 6
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: btn,
								disabled: busy,
								onClick: () => void startCreate(),
								children: "启动"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: btn,
								onClick: () => setShowCreate(false),
								children: "取消"
							})
						]
					}) : null,
					rows.length === 0 && !error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							color: "#8a94a6",
							fontSize: 13
						},
						children: "当前项目暂无后台进程，可点击「新建进程」启动一个。"
					}) : null,
					rows.map((row) => {
						const status = STATUS[row.status] ?? STATUS.stopped;
						const running = row.status === "running" || row.status === "stopping";
						return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: {
									width: 9,
									height: 9,
									borderRadius: "50%",
									background: status.color,
									boxShadow: row.status === "running" ? `0 0 0 3px ${status.background}` : void 0,
									flexShrink: 0
								} }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										flex: 1,
										minWidth: 0
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											fontWeight: 600,
											fontSize: 13
										},
										children: row.name
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: {
											color: "#6b7480",
											fontSize: 12,
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis"
										},
										title: row.command,
										children: row.command
									})]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "inline-flex",
										alignItems: "center",
										color: status.color,
										background: status.background,
										border: `1px solid ${status.color}40`,
										borderRadius: 6,
										padding: "3px 7px",
										fontSize: 12,
										fontWeight: 600,
										whiteSpace: "nowrap"
									},
									children: [status.label, row.pid ? ` · pid ${row.pid}` : ""]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										color: "#6b7480",
										fontSize: 12,
										whiteSpace: "nowrap"
									},
									children: [fmtTime(row.startedAt), row.detail ? ` · ${row.detail}` : ""]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									style: {
										display: "flex",
										gap: 6,
										flexShrink: 0
									},
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											style: btn,
											onClick: () => void showLog(row.id),
											children: "输出"
										}),
										running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											style: btn,
											disabled: busy,
											onClick: () => void run(() => props.stop(row.id)),
											children: "停止"
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											style: btn,
											disabled: busy,
											onClick: () => void run(() => props.restart(row.id)),
											children: "重启"
										}),
										!running ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											style: btn,
											disabled: busy,
											onClick: () => void run(() => props.remove(row.id)),
											children: "移除"
										}) : null
									]
								})
							]
						}, row.id);
					}),
					logFor ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: { marginTop: 12 },
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "space-between",
								marginBottom: 6
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: {
									fontSize: 12,
									color: "#6b7480"
								},
								children: [
									"输出（",
									String(logFor).slice(0, 8),
									"）"
								]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								style: btn,
								onClick: () => setLogFor(null),
								children: "关闭"
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
							ref: logRef,
							onScroll: () => {
								const element = logRef.current;
								if (element) logStickToBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 24;
							},
							style: {
								background: "#10141a",
								color: "#d7e0ea",
								padding: 12,
								borderRadius: 8,
								maxHeight: 320,
								overflow: "auto",
								fontSize: 12,
								whiteSpace: "pre-wrap"
							},
							children: logText || "（暂无输出）"
						})]
					}) : null
				]
			});
		}
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "ui-processes: dictionaries");
			const t = ctx.locale.bind(NS);
			const connection = ctx.connection;
			const call = async (endpoint, payload) => {
				const result = await connection.rpc.call("/processes", endpoint, payload);
				if (result && result.ok) return result.value;
				const message = result?.error?.message ?? `RPC ${endpoint} 失败`;
				throw new Error(message);
			};
			ctx.slots.inject("conversation.view", () => ctx.slots.register({
				name: "conversation.view",
				id: "processes",
				order: 20,
				locale: NS,
				label: () => t("view.processes"),
				inject: (sessionId) => ({
					sessionId: String(sessionId),
					list: () => call("list", { sessionId }),
					start: (command, name, cwd) => call("start", {
						sessionId,
						command,
						name,
						cwd
					}),
					stop: (id) => call("stop", {
						sessionId,
						processId: id
					}),
					restart: (id) => call("restart", {
						sessionId,
						processId: id
					}),
					remove: (id) => call("remove", {
						sessionId,
						processId: id
					}),
					output: (id) => call("output", {
						sessionId,
						processId: id
					})
				})
			}, ProcessesView));
		}
		//#endregion
		exports.ProcessesView = ProcessesView;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
