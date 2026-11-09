import { createContext as e, useCallback as t, useContext as n, useEffect as r, useMemo as i, useRef as a, useState as o, useSyncExternalStore as s } from "react";
import { useAppApi as c, useNavBadge as l, useNavigate as u } from "@kirocrew/app-sdk";
import d from "lucide-react";
import { Fragment as f, jsx as p, jsxs as m } from "react/jsx-runtime";
//#region src/types.ts
var h = "/api/apps/brain", g = {
	claimed: "已认领",
	local: "本地开发中",
	handed_over: "已交接",
	rejected: "接手被拒",
	running: "运行机在跑",
	parked: "停下等回答",
	acceptance: "等验收",
	merged: "已合并",
	closed: "已关闭"
}, _ = {
	public: "公开",
	internal: "内部",
	confidential: "机密",
	secret: "绝密",
	unsure: "不确定（按机密处理）"
};
//#endregion
//#region src/hooks.ts
function v(e) {
	let t = a(e);
	return t.current = e, t;
}
var y = "(prefers-reduced-motion: reduce)";
function b() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" && !!window.matchMedia(y)?.matches;
	} catch {
		return !1;
	}
}
function x() {
	let [e, t] = o(b);
	return r(() => {
		if (typeof window.matchMedia != "function") return;
		let e = window.matchMedia(y);
		if (!e) return;
		let n = () => t(!!e.matches);
		return e.addEventListener?.("change", n), () => e.removeEventListener?.("change", n);
	}, []), e;
}
//#endregion
//#region src/api.ts
var S = 5e3, C = encodeURIComponent, w = {
	status: () => `${h}/status`,
	settings: () => `${h}/settings`,
	refresh: () => `${h}/refresh`,
	overview: (e) => `${h}/overview?repo=${C(e || "all")}`,
	requirement: (e, t) => `${h}/requirements/${C(e)}/${C(t)}`,
	board: (e, t) => `${h}/board/${C(e)}/${C(t)}`,
	session: (e, t) => `${h}/requirements/${C(e)}/${C(t)}/session`,
	answer: (e, t) => `${h}/requirements/${C(e)}/${C(t)}/answer`,
	intakeNext: (e) => `${h}/intake/next?repo=${C(e)}`,
	intakeCheck: () => `${h}/intake/check`,
	intakeStart: () => `${h}/intake/start`,
	crew: () => `${h}/crew`,
	crewFix: () => `${h}/crew/fix`,
	brain: (e) => `${h}/brain?repo=${C(e)}`,
	reflectPreview: () => `${h}/brain/reflect/preview`,
	reflectApply: () => `${h}/brain/reflect/apply`,
	todo: () => `${h}/todo`,
	team: () => `${h}/team`,
	teamLoop: () => `${h}/team/loop`,
	importDefaults: () => `${h}/import/defaults`,
	importInspect: () => `${h}/import/inspect`,
	importClone: () => `${h}/import/clone`,
	importInstall: () => `${h}/import/install`,
	importJob: (e) => `${h}/import/jobs/${C(e)}`,
	importChoices: () => `${h}/import/choices`,
	importMerge: () => `${h}/import/merge`,
	importPull: () => `${h}/import/pull`,
	importPush: () => `${h}/import/push`,
	importCommit: () => `${h}/import/commit`,
	importUpgrade: () => `${h}/import/upgrade`,
	importPublish: () => `${h}/import/publish`,
	importAdd: () => `${h}/import/add`,
	repoRemove: () => `${h}/repos/remove`,
	meName: () => `${h}/me/name`
};
function T(e) {
	let t = e instanceof Error ? e.message : String(e), n = /^API (\d{3}): ([\s\S]*)$/.exec(t);
	if (!n) return t;
	let [, r, i] = n;
	try {
		let e = JSON.parse(i);
		if (e && typeof e.error == "string" && e.error) return `${e.error}（${r}）`;
	} catch {}
	return r === "401" ? "需要登录 KiroCrew dashboard（401）" : r === "403" ? "没有权限：只接受 dashboard 主人本人的请求（403）" : r === "404" ? "后端还没有这个接口（404）" : `请求失败（${r}）${i.trim() ? `：${i.trim().slice(0, 200)}` : ""}`;
}
function E(e) {
	let t = /^API (\d{3}):/.exec(e instanceof Error ? e.message : String(e));
	return t ? Number(t[1]) : 0;
}
function D(e, n = S) {
	let i = v(c()), [s, l] = o({
		data: null,
		error: "",
		status: 0,
		loading: e !== null,
		path: e
	}), u = a(!1), d = a(!1), f = v(e), p = a(() => {}), m = t(async () => {
		let e = f.current;
		if (e !== null) {
			if (u.current) d.current = !0;
			else {
				u.current = !0;
				try {
					let t = await i.current.get(e);
					if (f.current !== e) return;
					l({
						data: t,
						error: "",
						status: 0,
						loading: !1,
						path: e
					});
				} catch (t) {
					if (f.current !== e) return;
					l((e) => ({
						...e,
						error: T(t),
						status: E(t),
						loading: !1
					}));
				} finally {
					u.current = !1, d.current && (d.current = !1, p.current());
				}
			}
		}
	}, [i, f]);
	r(() => {
		if (e === null) {
			l({
				data: null,
				error: "",
				status: 0,
				loading: !1,
				path: e
			}), p.current = () => {};
			return;
		}
		l((t) => t.path === e ? t : {
			data: null,
			error: "",
			status: 0,
			loading: !0,
			path: e
		});
		let t, r = !0, i = 0, a = (e) => {
			clearTimeout(t);
			let n = ++i;
			t = setTimeout(() => void o(n), e);
		}, o = async (e) => {
			r && e === i && (document.hidden && n > 0 || (await m(), r && e === i && n > 0 && a(n)));
		}, s = () => {
			document.hidden ? (clearTimeout(t), i++) : n > 0 && a(0);
		};
		return p.current = () => a(0), a(0), document.addEventListener("visibilitychange", s), () => {
			r = !1, clearTimeout(t), p.current = () => {}, document.removeEventListener("visibilitychange", s);
		};
	}, [
		e,
		n,
		m
	]);
	let h = t(() => p.current(), []), g = t((e) => l((t) => ({
		...t,
		data: e,
		error: "",
		status: 0,
		loading: !1
	})), []), _ = s.path === e;
	return {
		data: _ ? s.data : null,
		error: _ ? s.error : "",
		status: _ ? s.status : 0,
		loading: _ ? s.loading : e !== null,
		reload: h,
		set: g
	};
}
function O(e) {
	let [n, r] = o(!1), [i, a] = o(""), [s, c] = o(null), l = v(e);
	return {
		run: t(async (...e) => {
			r(!0), a("");
			try {
				let t = await l.current(...e);
				return c(t), t;
			} catch (e) {
				return a(T(e)), null;
			} finally {
				r(!1);
			}
		}, [l]),
		busy: n,
		error: i,
		result: s,
		reset: t(() => {
			a(""), c(null);
		}, [])
	};
}
//#endregion
//#region src/format.ts
function k(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 60) return `${t} 秒`;
	let n = Math.round(t / 60);
	if (n < 60) return `${n} 分钟`;
	let r = Math.floor(n / 60), i = n % 60;
	return i ? `${r} 小时 ${i} 分` : `${r} 小时`;
}
function A(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 5) return "刚刚";
	if (t < 60) return `${t} 秒前`;
	let n = Math.floor(t / 60);
	if (n < 60) return `${n} 分钟前`;
	let r = Math.floor(n / 60);
	return r < 24 ? `${r} 小时前` : `${Math.floor(r / 24)} 天前`;
}
function j(e, t = Date.now() / 1e3) {
	return e == null || !Number.isFinite(e) ? "—" : A(t - e);
}
function M(e) {
	return e == null || !Number.isFinite(e) ? "—" : e >= 100 ? String(Math.round(e)) : (Math.round(e * 10) / 10).toFixed(1);
}
function N([e, t]) {
	return {
		frac: `${e}/${t}`,
		pct: t > 0 ? `${Math.round(e / t * 100)}%` : "—"
	};
}
var P = (e) => String(e).padStart(2, "0");
function F(e) {
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${t.getFullYear()}-${P(t.getMonth() + 1)}-${P(t.getDate())}`;
}
function I(e) {
	if (e == null || !Number.isFinite(e)) return "—";
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${F(e)} ${P(t.getHours())}:${P(t.getMinutes())}`;
}
function L(e) {
	if (!e) return "—";
	let t = Date.parse(e);
	return Number.isFinite(t) ? I(t / 1e3) : e;
}
function R(e) {
	if (!e) return null;
	let t = Date.parse(e);
	return Number.isFinite(t) ? F(t / 1e3) : null;
}
function ee(e) {
	return e.split("\n").map((e) => e.trim()).filter(Boolean);
}
function te(e) {
	return e.split(/[\s,，、;；]+/).filter(Boolean);
}
//#endregion
//#region src/jobs.ts
var ne = 1e3;
function z(e = ne, n) {
	let i = v(c()), a = v(n), [s, l] = o(null), [u, d] = o(""), [f, p] = o(0);
	return r(() => {
		if (!s || s.state !== "running") return;
		let t = !0, n = setTimeout(async () => {
			try {
				let e = await i.current.get(w.importJob(s.id));
				if (!t) return;
				d(""), l(e), e.state !== "running" && a.current?.(e);
			} catch (e) {
				if (!t) return;
				d(`读不到进度：${T(e)}（还会再读）`), p((e) => e + 1);
			}
		}, e);
		return () => {
			t = !1, clearTimeout(n);
		};
	}, [
		s,
		f,
		e,
		i,
		a
	]), {
		job: s,
		start: t((e) => {
			l(e), d(""), e && e.state !== "running" && a.current?.(e);
		}, [a]),
		readError: u
	};
}
//#endregion
//#region src/board/RoleIcon.tsx
var B = {
	intent: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("circle", {
			cx: "12",
			cy: "12",
			r: "8.5"
		}),
		/* @__PURE__ */ p("circle", {
			cx: "12",
			cy: "12",
			r: "4.5"
		}),
		/* @__PURE__ */ p("path", { d: "M12 12h.01" })
	] }),
	feasibility: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M12 4v15.5M8 19.5h8M5 7.5h14" }), /* @__PURE__ */ p("path", { d: "M5 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L5 7.5zM19 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L19 7.5z" })] }),
	scope: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M10 6.5h10M10 12h10M10 17.5h10" }), /* @__PURE__ */ p("path", { d: "M3.8 6.5l1.4 1.4L8 5M3.8 12l1.4 1.4L8 10.5M3.8 17.5l1.4 1.4L8 16" })] }),
	pm: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "5.5",
			y: "4.5",
			width: "13",
			height: "16",
			rx: "2"
		}),
		/* @__PURE__ */ p("path", { d: "M9.5 4.5V3.5h5v1" }),
		/* @__PURE__ */ p("path", { d: "M9 12.5l2 2 4-4" })
	] }),
	catalog: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "4",
			y: "4",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ p("rect", {
			x: "13.5",
			y: "4",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ p("rect", {
			x: "4",
			y: "13.5",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ p("rect", {
			x: "13.5",
			y: "13.5",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		})
	] }),
	detail: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "4",
			y: "3.5",
			width: "16",
			height: "17",
			rx: "2"
		}),
		/* @__PURE__ */ p("rect", {
			x: "7",
			y: "6.5",
			width: "10",
			height: "6",
			rx: "1"
		}),
		/* @__PURE__ */ p("path", { d: "M7 15.5h10M7 18h6" })
	] }),
	cart: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M3 4.5h2.5l2.2 10.5h10.6l2-7.5H6.6" }),
		/* @__PURE__ */ p("circle", {
			cx: "9.5",
			cy: "19",
			r: "1.4"
		}),
		/* @__PURE__ */ p("circle", {
			cx: "17",
			cy: "19",
			r: "1.4"
		})
	] }),
	security: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5l7.5-3z" }), /* @__PURE__ */ p("path", { d: "M9 12l2.2 2.2L15.5 10" })] }),
	architect: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" }),
		/* @__PURE__ */ p("path", { d: "M3.5 12.5l8.5 4.5 8.5-4.5" }),
		/* @__PURE__ */ p("path", { d: "M3.5 16.5l8.5 4 8.5-4" })
	] }),
	designer: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M4.5 19.5l1-4L15.5 5.5l3 3-10 10-4 1z" }), /* @__PURE__ */ p("path", { d: "M13.5 7.5l3 3" })] }),
	tester: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M9 3.5h6" }),
		/* @__PURE__ */ p("path", { d: "M10 3.5v6l-5 8.5a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9.5v-6" }),
		/* @__PURE__ */ p("path", { d: "M7.5 15.5h9" })
	] }),
	backend: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "3.5",
			y: "4.5",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ p("rect", {
			x: "3.5",
			y: "13",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ p("path", { d: "M7 7.75h.01M7 16.25h.01" })
	] }),
	frontend: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("rect", {
		x: "3.5",
		y: "4.5",
		width: "17",
		height: "11.5",
		rx: "1.5"
	}), /* @__PURE__ */ p("path", { d: "M9 20h6M12 16v4" })] }),
	mobile: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("rect", {
		x: "7",
		y: "3",
		width: "10",
		height: "18",
		rx: "2"
	}), /* @__PURE__ */ p("path", { d: "M11 18h2" })] }),
	ops: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 3.5l8 4.5v8L12 20.5 4 16V8l8-4.5z" }),
		/* @__PURE__ */ p("path", { d: "M4 8l8 4.5L20 8" }),
		/* @__PURE__ */ p("path", { d: "M12 12.5v8" })
	] }),
	deploy: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 3c3 2.2 4.5 5.5 4.5 9.5l-2 3h-5l-2-3C7.5 8.5 9 5.2 12 3z" }),
		/* @__PURE__ */ p("circle", {
			cx: "12",
			cy: "9.5",
			r: "1.6"
		}),
		/* @__PURE__ */ p("path", { d: "M9.5 15.5l-2 3.5M14.5 15.5l2 3.5M12 16v4.5" })
	] }),
	motion: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M3.5 18.5c4-1 7-4 8.5-9" }),
		/* @__PURE__ */ p("path", { d: "M17 3.5l1.1 2.4 2.4 1.1-2.4 1.1L17 10.5l-1.1-2.4-2.4-1.1 2.4-1.1z" }),
		/* @__PURE__ */ p("path", { d: "M6.5 6.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z" })
	] }),
	compliance: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M12 3.5l7 3v5.5c0 4.2-2.9 7.2-7 8.5-4.1-1.3-7-4.3-7-8.5V6.5l7-3z" }), /* @__PURE__ */ p("path", { d: "M9 12l2 2 4-4" })] }),
	reviewer: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "10.5",
		cy: "10.5",
		r: "6"
	}), /* @__PURE__ */ p("path", { d: "M15 15l5 5" })] }),
	product: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("rect", {
		x: "3.5",
		y: "3.5",
		width: "17",
		height: "17",
		rx: "2"
	}), /* @__PURE__ */ p("path", { d: "M3.5 9h17M9 9v11.5" })] })
}, re = {
	wait: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "8",
		r: "3.5"
	}), /* @__PURE__ */ p("path", { d: "M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" })] }),
	approved: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ p("path", { d: "M8.5 12.2l2.4 2.4 4.6-4.8" })] }),
	bounce: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M9 14L4 9l5-5" }), /* @__PURE__ */ p("path", { d: "M20 20v-7a4 4 0 0 0-4-4H4" })] }),
	sign: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M12 20h8" }), /* @__PURE__ */ p("path", { d: "M16.5 3.6a2.1 2.1 0 0 1 3 3L7 19.1l-4 .9.9-4L16.5 3.6z" })] }),
	merge: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("circle", {
			cx: "18",
			cy: "18",
			r: "2.5"
		}),
		/* @__PURE__ */ p("circle", {
			cx: "6",
			cy: "6",
			r: "2.5"
		}),
		/* @__PURE__ */ p("path", { d: "M6 21V8.5" }),
		/* @__PURE__ */ p("path", { d: "M6 8.5c0 5 4 9.5 9.5 9.5" })
	] }),
	book: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" }), /* @__PURE__ */ p("path", { d: "M12 6.5v13" })] }),
	issue: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "1.6"
	})] }),
	pr: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("circle", {
			cx: "18",
			cy: "18",
			r: "2.5"
		}),
		/* @__PURE__ */ p("circle", {
			cx: "6",
			cy: "6",
			r: "2.5"
		}),
		/* @__PURE__ */ p("path", { d: "M6 8.5V21" }),
		/* @__PURE__ */ p("path", { d: "M12.5 6H16a2 2 0 0 1 2 2v7.5" }),
		/* @__PURE__ */ p("path", { d: "M14.5 3.5L12 6l2.5 2.5" })
	] })
}, ie = {
	person: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "8",
		r: "3.6"
	}), /* @__PURE__ */ p("path", { d: "M4.8 20c.4-3.8 3.4-6.2 7.2-6.2s6.8 2.4 7.2 6.2" })] }),
	laptop: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "4.5",
			y: "5",
			width: "15",
			height: "10.5",
			rx: "1.6"
		}),
		/* @__PURE__ */ p("path", { d: "M2.5 19h19" }),
		/* @__PURE__ */ p("path", { d: "M8 9l2 1.6L8 12.2M11.5 12.4h3.5" })
	] }),
	req: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "5.5",
			y: "4.5",
			width: "13",
			height: "16",
			rx: "2"
		}),
		/* @__PURE__ */ p("path", { d: "M9.5 4.5V3.5h5v1" }),
		/* @__PURE__ */ p("path", { d: "M8.8 10.5h6.4M8.8 14h3.6" }),
		/* @__PURE__ */ p("path", { d: "M13.6 16.6l1.4 1.4 2.6-2.8" })
	] }),
	design: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" }),
		/* @__PURE__ */ p("path", { d: "M3.5 12.5l8.5 4.5 8.5-4.5" }),
		/* @__PURE__ */ p("path", { d: "M3.5 16.5l8.5 4 8.5-4" })
	] }),
	handover: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M20.5 3.5L10 14" }), /* @__PURE__ */ p("path", { d: "M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5z" })] }),
	bridge: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M2.5 9.5h19" }),
		/* @__PURE__ */ p("path", { d: "M3.5 18.5v-9M20.5 18.5v-9" }),
		/* @__PURE__ */ p("path", { d: "M3.5 17c2.2-4.4 5-6.5 8.5-6.5s6.3 2.1 8.5 6.5" }),
		/* @__PURE__ */ p("path", { d: "M8 12.6v5.9M12 10.5v8M16 12.6v5.9" })
	] }),
	signer: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "8",
		cy: "12",
		r: "3.8"
	}), /* @__PURE__ */ p("path", { d: "M11.8 12h9M17.5 12v3M20.5 12v2.2" })] }),
	runner: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("rect", {
			x: "3.5",
			y: "4",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ p("rect", {
			x: "3.5",
			y: "13.5",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ p("path", { d: "M7 7.25h.01M7 16.75h.01" }),
		/* @__PURE__ */ p("path", { d: "M13.5 5.8l3 1.45-3 1.45z" })
	] }),
	ci: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ p("path", { d: "M8.4 12.3l2.4 2.4 4.8-5" })] }),
	release: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M5.5 21V4" }), /* @__PURE__ */ p("path", { d: "M5.5 4.5h11l-2.2 3.8 2.2 3.8h-11" })] }),
	brain: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" }),
		/* @__PURE__ */ p("path", { d: "M12 6.5v13" }),
		/* @__PURE__ */ p("path", { d: "M15 9.5h2.5M15 12.5h2.5" })
	] }),
	commit: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "3.5"
	}), /* @__PURE__ */ p("path", { d: "M2.5 12h6M15.5 12h6" })] }),
	question: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z" }),
		/* @__PURE__ */ p("path", { d: "M10.2 8.9a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3" }),
		/* @__PURE__ */ p("path", { d: "M12 13.6h.01" })
	] }),
	blocked: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ p("path", { d: "M6 6l12 12" })] }),
	import: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" }), /* @__PURE__ */ p("path", { d: "M12 11v5M9.5 13.5h5" })] }),
	settings: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("circle", {
		cx: "12",
		cy: "12",
		r: "3"
	}), /* @__PURE__ */ p("path", { d: "M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" })] }),
	todo: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M3.5 13.5l2.5-8h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5z" }), /* @__PURE__ */ p("path", { d: "M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" })] }),
	new: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" }),
		/* @__PURE__ */ p("path", { d: "M13.5 3.5v6h6" }),
		/* @__PURE__ */ p("path", { d: "M12 12.5v5M9.5 15h5" })
	] }),
	lint: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("circle", {
			cx: "10.5",
			cy: "10.5",
			r: "6"
		}),
		/* @__PURE__ */ p("path", { d: "M15 15l5 5" }),
		/* @__PURE__ */ p("path", { d: "M8 10.5h5" })
	] }),
	file: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" }), /* @__PURE__ */ p("path", { d: "M13.5 3.5v6h6" })] }),
	clone: /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("path", { d: "M12 4v11" }),
		/* @__PURE__ */ p("path", { d: "M7.5 10.5L12 15l4.5-4.5" }),
		/* @__PURE__ */ p("path", { d: "M4.5 19.5h15" })
	] }),
	list: /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("path", { d: "M9 6.5h11M9 12h11M9 17.5h7" }), /* @__PURE__ */ p("path", { d: "M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" })] })
}, ae = /* @__PURE__ */ p("circle", {
	cx: "12",
	cy: "12",
	r: "7.5"
});
function oe(e) {
	return e && (B[e] || B[e.replace(/\d+$/, "")] || re[e] || ie[e]) || ae;
}
function V({ role: e, size: t = 18, className: n = "" }) {
	return /* @__PURE__ */ p("svg", {
		className: `kt-role-icon ${n}`.trim(),
		width: t,
		height: t,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.6,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		focusable: "false",
		children: oe(e)
	});
}
function se({ role: e, cx: t, cy: n, size: r = 22, className: i = "" }) {
	return /* @__PURE__ */ p("svg", {
		className: `kt-role-icon ${i}`.trim(),
		x: t - r / 2,
		y: n - r / 2,
		width: r,
		height: r,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.6,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": "true",
		children: oe(e)
	});
}
//#endregion
//#region src/ui.tsx
function H({ name: e, size: t = 15, className: n, title: r }) {
	let i = d[e];
	return i ? /* @__PURE__ */ p(i, {
		size: t,
		className: n,
		"aria-hidden": !r || void 0,
		"aria-label": r
	}) : null;
}
var ce = {
	claimed: "idle",
	local: "run",
	handed_over: "hand",
	rejected: "bad",
	running: "run",
	parked: "wait",
	acceptance: "wait",
	merged: "ok",
	closed: "idle"
}, le = {
	claimed: "○",
	local: "●",
	handed_over: "➜",
	rejected: "✕",
	running: "●",
	parked: "✋",
	acceptance: "✋",
	merged: "✔",
	closed: "■"
}, ue = /* @__PURE__ */ new Set([
	"local",
	"running",
	"parked",
	"acceptance"
]);
function U({ state: e, label: t }) {
	return /* @__PURE__ */ m("span", {
		className: `br-chip tone-${ce[e] ?? "idle"} kt-pill${ue.has(e) ? " is-live" : ""}`,
		"data-state": e,
		children: [/* @__PURE__ */ p("i", {
			"aria-hidden": "true",
			children: le[e] ?? "•"
		}), t || g[e] || e]
	});
}
var W = {
	OK: "ok",
	WARN: "warn",
	FAIL: "bad"
}, G = {
	OK: "正常",
	WARN: "注意",
	FAIL: "有问题"
}, de = {
	OK: "✓",
	WARN: "!",
	FAIL: "✕"
}, fe = {
	approved: {
		label: "已批准",
		tone: "ok"
	},
	pending: {
		label: "等你批",
		tone: "wait"
	},
	rejected: {
		label: "退回",
		tone: "bad"
	},
	stale: {
		label: "已过期",
		tone: "warn"
	},
	refused: {
		label: "被拒",
		tone: "bad"
	}
}, pe = {
	done: {
		label: "做完",
		glyph: "✓",
		tone: "ok"
	},
	skipped: {
		label: "跳过",
		glyph: "–",
		tone: "idle"
	},
	started: {
		label: "在做",
		glyph: "●",
		tone: "run"
	},
	todo: {
		label: "没开始",
		glyph: "○",
		tone: "idle"
	}
}, me = {
	waiting: {
		label: "等回答",
		tone: "wait"
	},
	open: {
		label: "已发出，等回答",
		tone: "wait"
	},
	answered: {
		label: "已收到回答，等桥签名送回",
		tone: "info"
	},
	delivered: {
		label: "已送回",
		tone: "ok"
	},
	stale: {
		label: "过期",
		tone: "warn"
	},
	invalid: {
		label: "无效",
		tone: "bad"
	},
	closed: {
		label: "已关闭",
		tone: "idle"
	},
	posting: {
		label: "正在发到 MR",
		tone: "wait"
	},
	asking: {
		label: "正在发到 MR",
		tone: "wait"
	},
	delivery_unknown: {
		label: "送没送到不清楚",
		tone: "warn"
	},
	void: {
		label: "作废",
		tone: "bad"
	},
	refused: {
		label: "签名服务拒签",
		tone: "bad"
	}
}, he = (e, t) => t === "park" && e === "answered" ? {
	label: "已回答",
	tone: "info"
} : me[e] ?? {
	label: e,
	tone: "idle"
}, ge = (e) => e.state === "waiting" || e.state === "open", _e = {
	todo: "下一步",
	done: "做完",
	skipped: "做完"
};
function ve({ lean: e, compact: t = !1 }) {
	let n = e.stage_state ? _e[e.stage_state] : void 0, r = e.stage_state === "started" && e.stage_n !== null ? e.stage_n : null;
	return /* @__PURE__ */ m("span", {
		className: "br-row",
		style: { gap: 6 },
		"data-testid": "lean-cell",
		children: [
			/* @__PURE__ */ p("span", {
				className: "br-mono",
				children: e.stage_n === null ? `0/${e.total}` : `${e.stage_n}/${e.total}`
			}),
			!t && /* @__PURE__ */ p("span", { children: e.stage_label ?? "还没开始" }),
			n && /* @__PURE__ */ p("span", {
				className: "br-hint",
				"data-testid": "lean-hint",
				children: n
			}),
			/* @__PURE__ */ p("span", {
				className: "br-prog",
				role: "img",
				"aria-label": `做完 ${e.done}/${e.total}`,
				title: `做完或跳过 ${e.done}/${e.total}`,
				children: Array.from({ length: e.total }, (t, n) => /* @__PURE__ */ p("i", { className: n < e.done ? "is-done" : r !== null && n === r - 1 ? "is-started" : "" }, n))
			})
		]
	});
}
function K({ href: e, children: t, className: n = "br-link" }) {
	return !e || !/^https?:\/\//i.test(e) ? /* @__PURE__ */ p("span", { children: t }) : /* @__PURE__ */ m("a", {
		className: n,
		href: e,
		target: "_blank",
		rel: "noopener noreferrer",
		children: [t, /* @__PURE__ */ p(H, {
			name: "ExternalLink",
			size: 12
		})]
	});
}
function ye({ mr: e }) {
	return e ? /* @__PURE__ */ m(K, {
		href: e.url,
		children: [
			"!",
			e.iid,
			e.state ? ` · ${be[e.state] ?? e.state}` : ""
		]
	}) : /* @__PURE__ */ p("span", {
		className: "br-dim",
		children: "—"
	});
}
var be = {
	opened: "开着",
	merged: "已合并",
	closed: "已关闭",
	locked: "锁着"
}, xe = "在会话里自己打这一行。app 不会替你发。";
function q({ line: e, sessionUrl: t }) {
	let n = u(), [r, i] = o(""), a = async () => {
		try {
			await navigator.clipboard.writeText(e), i("ok");
		} catch {
			i("fail");
		}
	};
	return /* @__PURE__ */ m("div", {
		className: "br-line",
		"data-testid": "type-line",
		children: [
			/* @__PURE__ */ p("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ m("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => void a(),
						children: [/* @__PURE__ */ p(H, {
							name: "Copy",
							size: 13
						}), "复制"]
					}),
					t && /* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => n(t),
						children: [/* @__PURE__ */ p(H, {
							name: "MessageSquare",
							size: 13
						}), "打开会话"]
					}),
					r === "ok" && /* @__PURE__ */ p("span", {
						className: "br-small br-ok-text",
						role: "status",
						children: "已复制"
					}),
					r === "fail" && /* @__PURE__ */ p("span", {
						className: "br-small br-bad-text",
						role: "status",
						children: "没复制成：请手动选中这一行"
					})
				]
			}),
			/* @__PURE__ */ p("p", { children: xe })
		]
	});
}
var Se = {
	agent: "补上 brain-dev 的 Lean hook",
	engine: "把引擎换成 kas"
}, Ce = "重装 kit 文件";
function we(e, t) {
	return e.fix === void 0 ? e.level === "OK" ? null : t?.agent && /brain-dev/.test(e.text) ? "agent" : t?.engine && /引擎/.test(e.text) ? "engine" : null : e.fix;
}
function Te({ rows: e, fix: t, only: n, onFixed: i, onHold: a, empty: s }) {
	let l = c(), u = O((e) => l.post(w.crewFix(), e)), [d, f] = o({}), h = v(a), g = Object.keys(d).length > 0;
	r(() => {
		h.current?.(g);
	}, [g, h]), r(() => () => h.current?.(!1), [h]);
	let _ = (e, t) => f((n) => {
		let r = { ...n };
		return t ? r[e.repo] = e : delete r[e.repo], r;
	}), y = n ? e.filter((e) => n.includes(e.level)) : e, b = new Set(y.filter((e) => e.repo && we(e, t) === "kit").map((e) => e.repo)), x = [...y, ...Object.values(d).filter((e) => !b.has(e.repo))], S = /* @__PURE__ */ new Set(), C = async (e) => {
		let t = await u.run({ what: e });
		t && i?.(t.rows);
	};
	return x.length ? /* @__PURE__ */ m("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "check-rows",
		children: [
			/* @__PURE__ */ p("ul", {
				className: "br-probs",
				children: x.map((n, r) => {
					let a = we(n, t), o = a === "kit" && !!n.repo && !S.has(n.repo);
					return o && S.add(n.repo), /* @__PURE__ */ m("li", {
						className: `br-prob is-${n.level}`,
						"data-level": n.level,
						children: [
							/* @__PURE__ */ p("span", {
								className: `br-prob-glyph tone-${W[n.level] ?? "idle"}`,
								role: "img",
								"aria-label": G[n.level] ?? n.level,
								children: de[n.level] ?? "•"
							}),
							/* @__PURE__ */ m("span", {
								className: "br-prob-text br-pre",
								children: [n.repo && /* @__PURE__ */ p("span", {
									className: "br-tag br-prob-repo",
									title: n.repo,
									children: n.repo.replace(/\/+$/, "").split("/").pop()
								}), n.text]
							}),
							n.todo && /* @__PURE__ */ m("span", {
								className: "br-prob-todo",
								children: [/* @__PURE__ */ p("b", { children: "做什么" }), n.todo]
							}),
							(a || n.raw) && /* @__PURE__ */ m("span", {
								className: "br-prob-acts",
								children: [
									(a === "agent" || a === "engine") && /* @__PURE__ */ m("button", {
										type: "button",
										className: "br-btn is-small is-primary",
										disabled: u.busy,
										onClick: () => void C(a),
										children: [/* @__PURE__ */ p(H, {
											name: "Wrench",
											size: 13
										}), Se[a]]
									}),
									o && /* @__PURE__ */ p(ke, {
										repo: n.repo,
										onHold: (e) => _(n, e),
										onDone: () => i?.(e)
									}),
									n.raw && /* @__PURE__ */ m("details", {
										className: "br-raw",
										children: [/* @__PURE__ */ p("summary", { children: "brain-kit 的原话" }), /* @__PURE__ */ p("pre", { children: n.raw })]
									})
								]
							})
						]
					}, o ? `kit:${n.repo}` : `${r}:${n.level}:${n.text}`);
				})
			}),
			u.result && /* @__PURE__ */ p("p", {
				className: `br-pre br-small ${u.result.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: u.result.text
			}),
			u.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: u.error
			})
		]
	}) : s ? /* @__PURE__ */ p("p", {
		className: "br-empty",
		children: s
	}) : null;
}
var Ee = {
	todo: "○",
	running: "●",
	ok: "✓",
	warn: "!",
	fail: "✕"
}, De = {
	todo: "idle",
	running: "run",
	ok: "ok",
	warn: "warn",
	fail: "bad"
};
function Oe({ job: e }) {
	let t = e.steps.find((e) => e.state === "running");
	return /* @__PURE__ */ m("div", {
		className: "br-stack",
		style: { gap: 4 },
		"data-testid": `job-${e.kind}`,
		"data-state": e.state,
		children: [
			/* @__PURE__ */ p("ol", {
				className: "br-jobsteps",
				"aria-label": "进度",
				children: e.steps.map((e) => /* @__PURE__ */ m("li", {
					className: `is-${e.state} tone-${De[e.state]}`,
					"data-step": e.id,
					"data-state": e.state,
					title: e.detail || e.label,
					children: [/* @__PURE__ */ p("i", {
						"aria-hidden": "true",
						children: Ee[e.state]
					}), /* @__PURE__ */ p("span", { children: e.label })]
				}, e.id))
			}),
			t && /* @__PURE__ */ m("span", {
				className: "br-hint",
				role: "status",
				children: [
					"正在",
					t.label,
					"…"
				]
			}),
			e.state === "failed" && e.error && /* @__PURE__ */ p("p", {
				className: "br-error br-pre",
				role: "alert",
				children: e.error
			})
		]
	});
}
function ke({ repo: e, onDone: t, onHold: n }) {
	let r = c(), [i, a] = o(!1), [s, l] = o(null), u = O(() => r.post(w.importChoices(), {
		path: e,
		purpose: "upgrade"
	})), d = O((t) => r.post(w.importUpgrade(), {
		path: e,
		mode: t
	})), h = () => {
		n?.(!1), t?.();
	}, g = z(ne, (e) => {
		if (e.state !== "done") return n?.(!1);
		let t = e.result;
		(t?.mode !== "inplace" || t.commit.ok && !t.remote_url) && h();
	}), _ = O(() => r.post(w.importCommit(), {
		path: e,
		purpose: "upgrade"
	})), v = O((e) => r.post(w.importPublish(), e)), y = g.job, b = y?.result ?? null, x = _.result ?? b?.commit, S = async (e) => {
		let t = await d.run(e);
		t && (n?.(!0), g.start(t.job));
	}, C = async () => {
		(await _.run())?.ok && !(b?.mode === "inplace" && b.remote_url) && h();
	}, T = async () => {
		let e = await u.run();
		if (e) {
			if (e.options.length === 1 && e.options[0].ok) return void S(e.options[0].mode);
			l(e);
		}
	}, E = u.busy || d.busy;
	if (!y) return /* @__PURE__ */ m("span", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "kit-fix-start",
		children: [s ? /* @__PURE__ */ p(Ae, {
			choices: s,
			busy: E,
			onPick: (e) => void S(e),
			onCancel: () => l(null)
		}) : /* @__PURE__ */ p("span", {
			className: "br-row",
			style: { gap: 6 },
			children: /* @__PURE__ */ m("button", {
				type: "button",
				className: "br-btn is-small is-primary",
				disabled: E,
				onClick: () => void T(),
				title: "重跑 brain install，用你的 git 身份提交：默认直接在当前分支上，团队仓库可以选新分支开 MR",
				children: [/* @__PURE__ */ p(H, {
					name: "Wrench",
					size: 13
				}), E ? "正在开始…" : Ce]
			})
		}), (u.error || d.error) && /* @__PURE__ */ p("span", {
			className: "br-error br-small",
			role: "alert",
			children: u.error || d.error
		})]
	});
	let D = b?.mode === "inplace";
	return /* @__PURE__ */ m("div", {
		className: "br-fixjob",
		"data-testid": "kit-fix",
		children: [
			/* @__PURE__ */ p(Oe, { job: y }),
			g.readError && /* @__PURE__ */ p("p", {
				className: "br-note",
				role: "status",
				children: g.readError
			}),
			b && /* @__PURE__ */ m(f, { children: [
				b.text && /* @__PURE__ */ p("p", {
					className: "br-pre",
					role: "status",
					children: b.text
				}),
				x && !x.ok && x.text && /* @__PURE__ */ m("div", {
					className: "br-banner is-error",
					role: "alert",
					children: [/* @__PURE__ */ p("p", {
						className: "br-pre",
						children: x.text
					}), /* @__PURE__ */ p("div", {
						className: "br-row",
						children: /* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-small",
							disabled: _.busy,
							onClick: () => void C(),
							children: _.busy ? "正在提交…" : "再提交一次"
						})
					})]
				}),
				x?.ok && D && b.remote_url && /* @__PURE__ */ p(je, {
					path: e,
					branch: b.branch,
					remoteUrl: b.remote_url,
					onDone: h,
					onLater: h
				}),
				x?.ok && !D && !b.remote_url && b.target && /* @__PURE__ */ p(J, {
					path: e,
					purpose: "upgrade",
					onDone: t,
					p: {
						merge: {
							ok: !0,
							why: "",
							confirm: !1
						},
						pull: null,
						mr_url: null,
						target: b.target,
						remote_url: ""
					}
				}),
				x?.ok && !D && b.remote_url && !v.result?.ok && (i ? /* @__PURE__ */ m("div", {
					className: "br-confirm",
					role: "group",
					"aria-label": "确认推送",
					children: [/* @__PURE__ */ m("p", { children: [
						"会把分支 ",
						/* @__PURE__ */ p("code", { children: b.branch }),
						" 推到 origin（",
						/* @__PURE__ */ p("code", { children: b.remote_url }),
						"）",
						b.gitlab_project ? /* @__PURE__ */ m(f, { children: [
							"，在 ",
							/* @__PURE__ */ p("code", { children: b.gitlab_project }),
							" 上开 MR：",
							/* @__PURE__ */ p("code", { children: b.branch }),
							" → ",
							/* @__PURE__ */ p("code", { children: b.target })
						] }) : "",
						"。"
					] }), /* @__PURE__ */ m("div", {
						className: "br-row",
						children: [/* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-small is-primary",
							disabled: v.busy,
							onClick: () => void v.run({
								path: e,
								branch: b.branch,
								target: b.target,
								remote_url: b.remote_url,
								confirm: !0,
								purpose: "upgrade"
							}).then(() => a(!1)),
							children: v.busy ? "正在推送…" : "确定推送"
						}), /* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-small",
							disabled: v.busy,
							onClick: () => a(!1),
							children: "取消"
						})]
					})]
				}) : /* @__PURE__ */ m("span", {
					className: "br-row",
					children: [/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => a(!0),
						children: [/* @__PURE__ */ p(H, {
							name: "GitPullRequest",
							size: 13
						}), "推送并开 MR"]
					}), /* @__PURE__ */ m("span", {
						className: "br-hint",
						children: [
							"合进 ",
							b.target || "默认分支",
							" 以后，这一行就好了。"
						]
					})]
				})),
				v.result && /* @__PURE__ */ m("p", {
					className: `br-pre br-small ${v.result.ok ? "br-ok-text" : "br-bad-text"}`,
					role: "status",
					children: [
						v.result.text,
						v.result.mr && /* @__PURE__ */ m(f, { children: [" ", /* @__PURE__ */ m(K, {
							href: v.result.mr.url,
							children: ["MR !", v.result.mr.iid]
						})] }),
						!v.result.mr && v.result.new_mr_url && /* @__PURE__ */ m(f, { children: [" ", /* @__PURE__ */ p(K, {
							href: v.result.new_mr_url,
							children: "在 GitLab 上开 MR"
						})] })
					]
				}),
				v.error && /* @__PURE__ */ p("p", {
					className: "br-error",
					role: "alert",
					children: v.error
				}),
				_.error && /* @__PURE__ */ p("p", {
					className: "br-error",
					role: "alert",
					children: _.error
				})
			] })
		]
	});
}
function Ae({ choices: e, busy: t, onPick: n, onCancel: r }) {
	return /* @__PURE__ */ m("div", {
		className: "br-modes",
		role: "group",
		"aria-label": "装在哪",
		"data-testid": "mode-pick",
		children: [e.options.map((r) => /* @__PURE__ */ m("div", {
			className: `br-mode${r.mode === e.recommend ? " is-rec" : ""}${r.ok ? "" : " is-off"}`,
			"data-mode": r.mode,
			children: [
				/* @__PURE__ */ p("button", {
					type: "button",
					className: `br-btn is-small${r.mode === e.recommend ? " is-primary" : ""}`,
					disabled: t || !r.ok,
					onClick: () => n(r.mode),
					children: r.title
				}),
				r.mode === e.recommend && /* @__PURE__ */ p("span", {
					className: "br-chip tone-ok",
					children: "推荐"
				}),
				/* @__PURE__ */ p("span", {
					className: "br-hint",
					children: r.ok ? r.line : r.why
				})
			]
		}, r.mode)), r && /* @__PURE__ */ p("button", {
			type: "button",
			className: "br-link br-small",
			onClick: r,
			children: "取消"
		})]
	});
}
function je({ path: e, branch: t, remoteUrl: n, onDone: r, onLater: i }) {
	let a = c(), [s, l] = o(!1), u = O(() => a.post(w.importPush(), {
		path: e,
		branch: t,
		remote_url: n,
		confirm: !0
	})), d = u.result, f = async () => {
		let e = await u.run();
		l(!1), e?.ok && r?.();
	};
	return /* @__PURE__ */ m("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "push-box",
		children: [
			!s && !d?.ok && /* @__PURE__ */ m("span", {
				className: "br-row",
				children: [
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => l(!0),
						children: [/* @__PURE__ */ p(H, {
							name: "Upload",
							size: 13
						}), d ? "再推一次" : `推送 ${t}`]
					}),
					i && /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: i,
						children: "先不推送"
					}),
					/* @__PURE__ */ p("span", {
						className: "br-hint",
						children: "可选：本机已经能用，推不推你说了算。"
					})
				]
			}),
			s && /* @__PURE__ */ m("div", {
				className: "br-confirm",
				role: "group",
				"aria-label": "确认推送",
				"data-testid": "push-confirm",
				children: [/* @__PURE__ */ m("p", { children: [
					"会把分支 ",
					/* @__PURE__ */ p("code", { children: t }),
					" 推到 origin（",
					/* @__PURE__ */ p("code", { children: n }),
					"），不强推。"
				] }), /* @__PURE__ */ m("div", {
					className: "br-row",
					children: [/* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						disabled: u.busy,
						onClick: () => void f(),
						children: u.busy ? "正在推送…" : "确定推送"
					}), /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: u.busy,
						onClick: () => l(!1),
						children: "取消"
					})]
				})]
			}),
			d && /* @__PURE__ */ p("p", {
				className: `br-pre br-small ${d.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: d.text
			}),
			u.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: u.error
			})
		]
	});
}
function J({ path: e, p: t, purpose: n, onDone: r }) {
	let i = c(), [a, s] = o(!1), l = O((t) => i.post(w.importMerge(), {
		path: e,
		confirm: t,
		...n ? { purpose: n } : {}
	})), u = O(() => i.post(w.importPull(), { path: e })), d = l.result, f = t.target || "默认分支", h = async (e) => {
		let t = await l.run(e);
		s(!1), t?.ok && !t.remote_url && r?.();
	}, g = async () => {
		(await u.run())?.ok && r?.();
	};
	return /* @__PURE__ */ m("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "pending-actions",
		children: [
			t.mr_url && /* @__PURE__ */ m("p", {
				className: "br-small",
				children: [
					"MR 开着：",
					/* @__PURE__ */ p(K, {
						href: t.mr_url,
						children: "在 GitLab 上看 MR"
					}),
					"（在那里合并是团队的做法，合并以后点「拉取」）"
				]
			}),
			t.merge && !d?.ok && (t.merge.ok ? a ? /* @__PURE__ */ m("div", {
				className: "br-confirm",
				role: "group",
				"aria-label": "确认合并",
				"data-testid": "merge-confirm",
				children: [/* @__PURE__ */ m("p", { children: [
					"在本机把它快进合并到 ",
					/* @__PURE__ */ p("code", { children: f }),
					"。远端（",
					/* @__PURE__ */ p("code", { children: t.remote_url }),
					"）还没有它，要你自己推送。"
				] }), /* @__PURE__ */ m("div", {
					className: "br-row",
					children: [/* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						disabled: l.busy,
						onClick: () => void h(!0),
						children: l.busy ? "正在合并…" : "确定合并"
					}), /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: l.busy,
						onClick: () => s(!1),
						children: "取消"
					})]
				})]
			}) : /* @__PURE__ */ m("span", {
				className: "br-row",
				children: [/* @__PURE__ */ m("button", {
					type: "button",
					className: `br-btn is-small${t.merge.confirm ? "" : " is-primary"}`,
					disabled: l.busy,
					onClick: () => t.merge?.confirm ? s(!0) : void h(!1),
					children: [/* @__PURE__ */ p(H, {
						name: "GitMerge",
						size: 13
					}), l.busy ? "正在合并…" : t.merge.confirm ? `在本机合并到 ${f}` : `合并到 ${f}`]
				}), /* @__PURE__ */ p("span", {
					className: "br-hint",
					children: "快进合并，不多一个提交；装用的工作目录和分支随后删掉。"
				})]
			}) : /* @__PURE__ */ p("p", {
				className: "br-small br-warn-text",
				"data-testid": "merge-why",
				children: t.merge.why
			})),
			d && /* @__PURE__ */ p("p", {
				className: `br-pre br-small ${d.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: d.text
			}),
			d?.ok && d.remote_url && /* @__PURE__ */ p(je, {
				path: e,
				branch: d.branch,
				remoteUrl: d.remote_url,
				onDone: r,
				onLater: r
			}),
			t.pull && !u.result?.ok && (t.pull.ok ? /* @__PURE__ */ m("span", {
				className: "br-row",
				children: [/* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn is-small is-primary",
					disabled: u.busy,
					onClick: () => void g(),
					children: [/* @__PURE__ */ p(H, {
						name: "Download",
						size: 13
					}), u.busy ? "正在拉取…" : "拉取"]
				}), /* @__PURE__ */ p("span", {
					className: "br-hint",
					children: "git pull --ff-only：只快进，不合并、不变基。"
				})]
			}) : /* @__PURE__ */ p("p", {
				className: "br-small br-warn-text",
				"data-testid": "pull-why",
				children: t.pull.why
			})),
			u.result && /* @__PURE__ */ p("p", {
				className: `br-pre br-small ${u.result.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: u.result.text
			}),
			(l.error || u.error) && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: l.error || u.error
			})
		]
	});
}
var Me = {
	session: "回答会送进你的本地会话",
	mr: "回答会以你的 GitLab 身份发在 MR 上"
}, Ne = [{
	value: "approve",
	label: "同意（approve）"
}, {
	value: "reject",
	label: "不同意（reject）"
}];
function Pe({ question: e, repo: t, reqKey: n, onDone: r }) {
	let i = c(), [a, s] = o(""), [l, u] = o(""), d = O((e) => i.post(w.answer(t, n), e));
	if (!e.answerable_here || e.lean_request) return null;
	let f = `answer-${t}-${n}-${e.id ?? e.question.slice(0, 16)}`, h = async () => {
		let t = { choice: a.trim() };
		l.trim() && (t.note = l.trim()), e.id && (t.id = e.id);
		let n = await d.run(t);
		n && (s(""), u(""), r?.(n));
	};
	return /* @__PURE__ */ m("form", {
		className: "br-stack",
		style: { gap: 8 },
		"aria-label": `回答 ${e.id ?? n}`,
		onSubmit: (e) => {
			e.preventDefault(), h();
		},
		children: [
			e.options.length > 0 ? /* @__PURE__ */ m("fieldset", {
				className: "br-fieldset",
				children: [/* @__PURE__ */ p("legend", { children: "选一个" }), e.options.map((t) => /* @__PURE__ */ m("label", {
					className: "br-check",
					children: [/* @__PURE__ */ p("input", {
						type: "radio",
						name: f,
						value: t.id,
						checked: a === t.id,
						onChange: () => s(t.id)
					}), /* @__PURE__ */ m("span", { children: [
						/* @__PURE__ */ p("b", {
							className: "br-mono",
							children: t.id
						}),
						" ",
						t.text,
						e.recommend === t.id && /* @__PURE__ */ p("span", {
							className: "br-chip tone-ok",
							style: { marginLeft: 6 },
							children: "推荐"
						})
					] })]
				}, t.id))]
			}) : /* @__PURE__ */ m("fieldset", {
				className: "br-fieldset",
				children: [/* @__PURE__ */ p("legend", { children: "同意吗" }), Ne.map((e) => /* @__PURE__ */ m("label", {
					className: "br-check",
					children: [/* @__PURE__ */ p("input", {
						type: "radio",
						name: f,
						value: e.value,
						checked: a === e.value,
						onChange: () => s(e.value)
					}), /* @__PURE__ */ p("span", { children: e.label })]
				}, e.value))]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-field",
				children: [/* @__PURE__ */ p("label", {
					htmlFor: `${f}-note`,
					children: "补一句（可不填）"
				}), /* @__PURE__ */ p("textarea", {
					id: `${f}-note`,
					rows: 2,
					value: l,
					onChange: (e) => u(e.target.value)
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-row",
				children: [/* @__PURE__ */ p("button", {
					type: "submit",
					className: "br-btn is-primary",
					disabled: !a.trim() || d.busy,
					children: d.busy ? "正在发…" : "回答"
				}), e.answer_via && /* @__PURE__ */ p("span", {
					className: "br-hint",
					children: Me[e.answer_via]
				})]
			}),
			d.result && /* @__PURE__ */ p("p", {
				className: "br-pre br-ok-text",
				role: "status",
				children: d.result.text
			}),
			d.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: d.error
			})
		]
	});
}
var Fe = "先导入一个项目仓库：本机的目录，或者从 GitLab 克隆。app 会先检查它；没装 brain-kit 的，直接装在当前分支并提交，马上能用（团队仓库也可以装到新分支、开 MR）。", Ie = [
	{
		icon: "import",
		title: "从哪来",
		text: "本机目录，或从 GitLab 克隆"
	},
	{
		icon: "lint",
		title: "检查",
		text: "只读：git、brain-kit、Lean、KiroCrew"
	},
	{
		icon: "handover",
		title: "安装",
		text: "没装 brain-kit 的：装上并提交"
	},
	{
		icon: "list",
		title: "加入列表",
		text: "交付总览、开需求就能用了"
	}
];
function Le({ onImport: e, title: t = "还没有仓库" }) {
	return /* @__PURE__ */ p(Ue, {
		testid: "import-cta",
		label: "导入仓库",
		title: t,
		text: [Fe],
		punch: "导入以后，每个需求都在这里：在哪一步、等谁、花了多少。",
		flow: Ie,
		children: /* @__PURE__ */ m("button", {
			type: "button",
			className: "br-btn is-primary is-big",
			onClick: e,
			children: [/* @__PURE__ */ p(V, {
				role: "import",
				size: 17
			}), "导入仓库"]
		})
	});
}
function Re({ repo: e, onOpen: t, onDone: n, banner: r = !1 }) {
	let i = e.pending;
	if (!i) return null;
	let a = i.remote_url ? {
		...i,
		merge: null
	} : i, o = !!(a.merge || a.pull || a.mr_url), s = !o || a.state === "uncommitted" || a.state === "branch" && !!a.remote_url;
	return /* @__PURE__ */ m("div", {
		className: r ? "br-banner is-info" : "br-stack",
		style: r ? void 0 : { gap: 4 },
		role: "status",
		"data-testid": "repo-pending",
		"data-repo": e.id,
		children: [/* @__PURE__ */ m("div", {
			className: "br-row",
			children: [/* @__PURE__ */ m("span", { children: [
				r && /* @__PURE__ */ m("b", {
					className: "br-strong",
					children: [e.name, "："]
				}),
				a.text,
				"。",
				a.next
			] }), s && /* @__PURE__ */ p("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: t,
				children: "去导入仓库"
			})]
		}), o && /* @__PURE__ */ p(J, {
			path: e.path,
			p: a,
			onDone: n
		}, `${a.state}:${a.branch}`)]
	});
}
var ze = /^[a-z0-9][a-z0-9._-]{0,63}$/, Be = "只能用小写字母、数字和 . _ -（字母或数字开头）";
function Ve({ path: e, me: t, onSaved: n }) {
	let r = c(), [i, a] = o(t.suggest), s = O((t) => r.post(w.meName(), {
		path: e,
		name: t
	})), l = i.trim().toLowerCase(), u = !!l && !ze.test(l), d = s.result;
	if (d || !t.ask) {
		let e = d?.me ?? t;
		return /* @__PURE__ */ m("p", {
			className: `br-me${e.error ? " is-bad" : ""}`,
			"data-testid": "me-line",
			children: [
				/* @__PURE__ */ p(V, {
					role: "person",
					size: 15
				}),
				/* @__PURE__ */ p("span", { children: e.text || e.error }),
				d && /* @__PURE__ */ p("span", {
					className: "br-ok-text br-small",
					role: "status",
					children: "已保存"
				})
			]
		});
	}
	let f = `me-${e.replace(/[^A-Za-z0-9]+/g, "-")}`, h = async () => {
		let e = await s.run(l);
		e && n?.(e);
	}, g = !s.busy && !!l && !u;
	return /* @__PURE__ */ m("div", {
		className: "br-me-ask",
		role: "group",
		"aria-label": t.label,
		"data-testid": "me-ask",
		children: [
			/* @__PURE__ */ p("label", {
				htmlFor: f,
				children: t.label
			}),
			/* @__PURE__ */ m("span", {
				className: "br-row",
				children: [/* @__PURE__ */ p("input", {
					id: f,
					type: "text",
					className: "br-mono",
					value: i,
					spellCheck: !1,
					autoComplete: "off",
					"aria-invalid": u || void 0,
					onChange: (e) => a(e.target.value),
					onKeyDown: (e) => {
						e.key === "Enter" && (e.preventDefault(), g && h());
					}
				}), /* @__PURE__ */ p("button", {
					type: "button",
					className: "br-btn is-small is-primary",
					disabled: !g,
					onClick: () => void h(),
					children: s.busy ? "正在保存…" : "保存"
				})]
			}),
			t.error && /* @__PURE__ */ p("span", {
				className: "br-warn-text br-small",
				children: t.error
			}),
			/* @__PURE__ */ p("span", {
				className: "br-hint",
				children: u ? Be : t.why
			}),
			s.error && /* @__PURE__ */ p("span", {
				className: "br-error",
				role: "alert",
				children: s.error
			})
		]
	});
}
function Y({ loading: e, error: t, has: n }) {
	return t ? /* @__PURE__ */ p("div", {
		className: `br-banner${n ? "" : " is-error"}`,
		role: "alert",
		children: n ? `刷新没成：${t}，显示的是上一次拿到的数据` : t
	}) : e && !n ? /* @__PURE__ */ p("p", {
		className: "br-loading",
		children: "正在读取…"
	}) : null;
}
function He({ steps: e, label: t, numbered: n = !0 }) {
	return /* @__PURE__ */ p("ol", {
		className: "br-flow",
		style: { "--n": e.length },
		"aria-label": t,
		children: e.map((e, t) => /* @__PURE__ */ m("li", {
			className: e.state ? `is-${e.state}` : void 0,
			"data-state": e.state,
			children: [
				/* @__PURE__ */ p(V, {
					role: e.icon,
					size: 26
				}),
				/* @__PURE__ */ m("b", { children: [n && /* @__PURE__ */ p("span", {
					className: "br-flow-n",
					children: e.state === "done" ? "✓" : t + 1
				}), e.title] }),
				e.text && /* @__PURE__ */ p("small", { children: e.text })
			]
		}, `${e.title}-${t}`))
	});
}
function Ue({ title: e, text: t, punch: n, flow: r, children: i, testid: a, label: o }) {
	return /* @__PURE__ */ m("section", {
		className: "br-hero",
		"data-testid": a,
		"aria-label": o ?? e,
		children: [
			/* @__PURE__ */ m("div", { children: [
				/* @__PURE__ */ p("h2", { children: e }),
				t?.map((e, t) => /* @__PURE__ */ p("p", { children: e }, t)),
				n && /* @__PURE__ */ p("p", {
					className: "br-punch",
					children: n
				})
			] }),
			r && /* @__PURE__ */ p(He, { steps: r }),
			i && /* @__PURE__ */ p("div", {
				className: "br-hero-acts",
				children: i
			})
		]
	});
}
function We({ label: e, value: t, of: n, note: r, tone: i, children: a, testid: o }) {
	return /* @__PURE__ */ m("div", {
		className: `br-kpi${i ? ` is-${i}` : ""}`,
		"data-testid": o,
		children: [
			/* @__PURE__ */ p("div", {
				className: "br-kpi-label",
				children: e
			}),
			/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
				className: "br-kpi-big",
				children: t
			}), n !== void 0 && /* @__PURE__ */ p("span", {
				className: "br-kpi-of",
				children: n
			})] }),
			a,
			r && /* @__PURE__ */ p("div", {
				className: "br-kpi-note",
				children: r
			})
		]
	});
}
function Ge({ cells: e, label: t }) {
	return /* @__PURE__ */ p("div", {
		className: "kt-segs br-segs",
		role: "img",
		"aria-label": t,
		children: e.map((e, t) => /* @__PURE__ */ p("i", {
			className: e.tone === "pass" ? "is-pass" : e.tone === "fail" ? "is-fail" : e.tone === "run" ? "is-run" : "",
			title: e.title
		}, t))
	});
}
//#endregion
//#region src/AppBar.tsx
var Ke = [
	[
		"overview",
		"交付总览",
		"全部需求：结果、需求流动、交付清单"
	],
	[
		"item",
		"需求详情",
		"一个需求：周期、时间花在哪、成本、检查、决定和问题"
	],
	[
		"board",
		"需求看板",
		"一个需求怎么走：你、本机会话、Lean 的审批、交接、运行机、检查、验收"
	],
	[
		"new",
		"开需求",
		"认领一个需求，文档过五关，开工"
	],
	[
		"brain",
		"Brain",
		"仓库里的共享知识：条目、检查、用处、回写"
	],
	[
		"todo",
		"待办",
		"等你做的事"
	],
	[
		"team",
		"运行机",
		"团队运行机：交接、运行、签名"
	]
];
function qe({ view: e, onView: t, item: n, picking: r, todo: i, team: a }) {
	return /* @__PURE__ */ m("header", {
		className: "br-bar",
		"data-testid": "br-appbar",
		children: [
			/* @__PURE__ */ m("h1", { children: [/* @__PURE__ */ p(V, {
				role: "brain",
				size: 16
			}), "Brain 交付"] }),
			/* @__PURE__ */ p("div", {
				className: "br-tabs",
				role: "tablist",
				"aria-label": "视图",
				children: Ke.filter(([e]) => e !== "team" || a).map(([a, o, s]) => {
					let c = a === "item" || a === "board";
					return /* @__PURE__ */ m("button", {
						type: "button",
						role: "tab",
						"aria-selected": e === a,
						disabled: c && !n && !!r,
						title: c ? n ? `${s}（${n}）` : `${s}（打开等你的那个需求，没有就打开最近的）` : s,
						"aria-label": a === "todo" && i > 0 ? `待办 ${i}` : void 0,
						onClick: () => e !== a && t(a),
						children: [
							o,
							c && n && e === a && /* @__PURE__ */ p("span", {
								className: "br-bar-key",
								children: n
							}),
							a === "todo" && i > 0 && /* @__PURE__ */ p("span", {
								className: "br-count",
								"aria-hidden": "true",
								children: i
							})
						]
					}, a);
				})
			}),
			/* @__PURE__ */ p("span", { className: "br-grow" }),
			/* @__PURE__ */ m("button", {
				type: "button",
				className: "br-btn",
				"aria-pressed": e === "import",
				onClick: () => e !== "import" && t("import"),
				title: "本机目录或克隆：检查它，没装 brain-kit 就装到新分支上",
				children: [/* @__PURE__ */ p(H, {
					name: "FolderPlus",
					size: 14
				}), "导入仓库"]
			}),
			/* @__PURE__ */ m("button", {
				type: "button",
				className: "br-btn",
				"aria-pressed": e === "settings",
				onClick: () => e !== "settings" && t("settings"),
				title: "brain-kit、仓库、团队模式",
				children: [/* @__PURE__ */ p(H, {
					name: "Settings",
					size: 14
				}), "设置"]
			})
		]
	});
}
//#endregion
//#region src/nav.ts
var Je = [
	"PRODUCT",
	"TECH",
	"IMPROVEMENT",
	"PROJECT"
], Ye = /^(r[1-9][0-9]{0,2}|runner)$/, Xe = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$/, Ze = /^[A-Z]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})$/, Qe = /^(?:\/|~\/)[^\u0000-\u001f\u007f]{0,1023}$/, $e = Object.keys(g), et = [
	"overview",
	"todo",
	"brain",
	"board"
], tt = [
	"overview",
	"item",
	"todo"
], nt = [
	"accept",
	"checks",
	"lanes",
	"feed"
], rt = (e) => {
	let t = e.get("repo") ?? "";
	return Ye.test(t) ? { repo: t } : {};
};
function it(e) {
	let t = new URLSearchParams(e), n = t.get("view");
	if (n === "item") {
		let e = t.get("repo") ?? "", n = t.get("key") ?? "";
		if (!Ye.test(e) || !Xe.test(n)) return { kind: "overview" };
		let r = t.get("from") ?? "";
		return {
			kind: "item",
			repo: e,
			key: n,
			...et.includes(r) ? { from: r } : {}
		};
	}
	if (n === "board") {
		let e = t.get("repo") ?? "", n = t.get("key") ?? "";
		if (!Ye.test(e) || !Xe.test(n)) return { kind: "overview" };
		let r = {
			kind: "board",
			repo: e,
			key: n
		};
		t.get("replay") === "1" && (r.replay = !0);
		let i = t.get("focus") ?? "";
		nt.includes(i) && (r.focus = i);
		let a = t.get("from") ?? "";
		return tt.includes(a) && (r.from = a), r;
	}
	if (n === "new") return {
		kind: "new",
		...rt(t)
	};
	if (n === "brain") {
		let e = {
			kind: "brain",
			...rt(t)
		}, n = t.get("file") ?? "";
		Je.includes(n) && (e.file = n);
		let r = t.get("id") ?? "";
		Ze.test(r) && (e.id = r);
		let i = t.get("reflect") ?? "";
		return Xe.test(i) && (e.reflect = i), e;
	}
	if (n === "todo" || n === "team" || n === "settings") return { kind: n };
	if (n === "import") {
		let e = t.get("path") ?? "";
		return {
			kind: "import",
			...Qe.test(e) ? { path: e } : {}
		};
	}
	let r = {
		kind: "overview",
		...rt(t)
	}, i = t.get("state") ?? "";
	return $e.includes(i) && (r.state = i), r;
}
function at(e) {
	let t = new URLSearchParams(), n = (e, n) => void (n ? t.set(e, n) : void 0);
	switch (e.kind) {
		case "overview":
			(e.repo || e.state) && t.set("view", "overview"), n("repo", e.repo), n("state", e.state);
			break;
		case "item":
			t.set("view", "item"), n("repo", e.repo), n("key", e.key), n("from", e.from);
			break;
		case "board":
			t.set("view", "board"), n("repo", e.repo), n("key", e.key), e.replay && t.set("replay", "1"), n("focus", e.focus), n("from", e.from);
			break;
		case "new":
			t.set("view", "new"), n("repo", e.repo);
			break;
		case "brain":
			t.set("view", "brain"), n("repo", e.repo), n("file", e.file), n("id", e.id), n("reflect", e.reflect);
			break;
		case "import":
			t.set("view", "import"), n("path", e.path && Qe.test(e.path) ? e.path : void 0);
			break;
		default: t.set("view", e.kind);
	}
	let r = t.toString();
	return r ? `?${r}` : "";
}
function ot(e) {
	return {
		P: "PRODUCT",
		T: "TECH",
		I: "IMPROVEMENT",
		J: "PROJECT"
	}[e.charAt(0)];
}
//#endregion
//#region src/views/Question.tsx
var st = {
	park: "本地会话",
	bridge: "运行机",
	mr: "MR"
};
function ct({ id: e, repo: t, go: n }) {
	if (!Ze.test(e)) return /* @__PURE__ */ p("span", {
		className: "br-tag br-mono",
		children: e
	});
	let r = ot(e);
	return /* @__PURE__ */ p("button", {
		type: "button",
		className: "br-tag",
		title: "在 Brain 里看这一条",
		onClick: () => n({
			kind: "brain",
			...t && t !== "runner" ? { repo: t } : {},
			id: e,
			...r ? { file: r } : {}
		}),
		children: e
	});
}
function lt({ q: e, repo: t, reqKey: n, mrUrl: r, onAnswered: i }) {
	let a = he(e.state, e.source), o = ge(e), s = e.answerable_here && !e.lean_request, c = r === void 0 ? e.mr_url : r;
	return /* @__PURE__ */ m("article", {
		className: `br-q${o ? " is-open" : ""}`,
		"aria-label": `问题 ${e.id ?? e.kind_label}`,
		"data-testid": "question",
		children: [
			/* @__PURE__ */ m("div", {
				className: "br-row",
				children: [
					e.id && /* @__PURE__ */ p("b", {
						className: "br-key",
						children: e.id
					}),
					/* @__PURE__ */ p("span", {
						className: "br-tag",
						children: st[e.source] ?? e.source
					}),
					/* @__PURE__ */ p("span", {
						className: "br-chip tone-info",
						children: e.kind_label || e.kind
					}),
					/* @__PURE__ */ p("span", {
						className: `br-chip tone-${a.tone}`,
						children: a.label
					}),
					e.at !== null && /* @__PURE__ */ p("span", {
						className: "br-dim br-small",
						children: I(e.at)
					})
				]
			}),
			e.question && /* @__PURE__ */ p("p", {
				className: "br-pre br-strong",
				children: e.question
			}),
			e.options.length > 0 && !s && /* @__PURE__ */ p("ol", {
				className: "br-opts",
				"aria-label": "选项",
				children: e.options.map((t) => /* @__PURE__ */ m("li", { children: [
					/* @__PURE__ */ p("b", {
						className: "br-mono",
						children: t.id
					}),
					" ",
					t.text,
					e.recommend === t.id && /* @__PURE__ */ p("span", {
						className: "br-chip tone-ok",
						style: { marginLeft: 6 },
						children: "推荐"
					})
				] }, t.id))
			}),
			e.recommend && !e.options.some((t) => t.id === e.recommend) && /* @__PURE__ */ m("p", {
				className: "br-note",
				children: ["推荐：", e.recommend]
			}),
			e.lean_request && /* @__PURE__ */ m("p", {
				className: "br-note",
				children: [
					"这是 Lean 的审批请求（",
					/* @__PURE__ */ p("code", { children: e.lean_request }),
					"）：在会话里自己打批准那一行，这里不能回答。"
				]
			}),
			e.answer && /* @__PURE__ */ m("p", {
				className: "br-pre",
				style: { margin: 0 },
				children: [
					"回答：",
					/* @__PURE__ */ p("b", {
						className: "br-strong",
						children: e.answer
					}),
					e.answerer ? ` · ${e.answerer}` : "",
					e.voucher_id && /* @__PURE__ */ m(f, { children: [" · 凭证 ", /* @__PURE__ */ p("code", { children: e.voucher_id })] })
				]
			}),
			(c || e.refs.length > 0) && /* @__PURE__ */ m("div", {
				className: "br-row br-small",
				children: [c && /* @__PURE__ */ p(K, {
					href: c,
					children: o && !s ? "去 MR 上回答" : "在 MR 上看"
				}), e.refs.map((e) => /* @__PURE__ */ p("span", {
					className: "br-tag br-mono",
					children: e
				}, e))]
			}),
			/* @__PURE__ */ p(Pe, {
				question: e,
				repo: t,
				reqKey: n,
				onDone: () => i?.()
			})
		]
	});
}
function ut(e) {
	return e.source === "file" ? `${e.path ?? "MR.md"} · 提交 ${e.ref ?? "?"}` : e.source === "records" ? `由记录生成 · 提交 ${e.ref ?? "?"}（分支上还没有 ${e.path ?? "MR.md"}）` : "";
}
function dt(e) {
	let [t, n] = o("");
	return {
		copied: t,
		copy: async () => {
			try {
				await navigator.clipboard.writeText(e), n("ok");
			} catch {
				n("fail");
			}
		}
	};
}
function ft({ m: e, bare: t = !1 }) {
	let { copied: n, copy: r } = dt(e.text), i = ut(e), a = /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ m("header", {
			className: "br-row",
			children: [
				/* @__PURE__ */ p("h3", { children: "变更说明" }),
				i && /* @__PURE__ */ p("span", {
					className: "br-dim br-small",
					children: i
				}),
				/* @__PURE__ */ p("span", { className: "br-grow" }),
				e.text && /* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => void r(),
					children: [/* @__PURE__ */ p(H, {
						name: "Copy",
						size: 13
					}), "复制"]
				})
			]
		}),
		e.error && /* @__PURE__ */ p("p", {
			className: "br-note",
			children: e.error
		}),
		e.first && /* @__PURE__ */ p("p", {
			className: "br-strong br-mrfirst",
			style: { margin: 0 },
			"data-testid": "mr-desc-first",
			children: e.first
		}),
		e.text && /* @__PURE__ */ m("details", {
			className: "br-raw",
			children: [/* @__PURE__ */ p("summary", { children: "看全文（Markdown）" }), /* @__PURE__ */ p("pre", {
				"data-testid": "mr-desc-text",
				children: e.text
			})]
		}),
		n === "ok" && /* @__PURE__ */ p("span", {
			className: "br-small br-ok-text",
			role: "status",
			children: "已复制"
		}),
		n === "fail" && /* @__PURE__ */ p("span", {
			className: "br-small br-bad-text",
			role: "status",
			children: "没复制成：请展开全文手动选中"
		}),
		e.text && /* @__PURE__ */ p("p", {
			className: "br-hint",
			children: "复制的是 brain-kit 处理过的文字：贴进 GitLab 的 MR 描述里，@ 提到人、HTML、图片、快捷命令、像批准或回答的行都不会生效。"
		})
	] });
	return t ? /* @__PURE__ */ p("div", {
		className: "br-stack",
		style: { gap: 8 },
		"aria-label": "变更说明",
		"data-testid": "mr-desc",
		children: a
	}) : /* @__PURE__ */ p("section", {
		className: "br-card",
		"aria-label": "变更说明",
		"data-testid": "mr-desc",
		children: a
	});
}
var pt = {
	waiting: {
		label: "还没轮到",
		tone: "idle",
		icon: "⏳",
		hint: "前面的步骤还没做完"
	},
	queued: {
		label: "排队",
		tone: "queue",
		icon: "⏸",
		hint: "交给它了，它还没接"
	},
	running: {
		label: "在做",
		tone: "run",
		icon: "●",
		hint: "它正在做"
	},
	stalled: {
		label: "卡住",
		tone: "warn",
		icon: "⚠",
		hint: "停住了：要人看一下"
	},
	awaiting_approval: {
		label: "等人",
		tone: "approve",
		icon: "✋",
		hint: "等一个人：批准、回答或验收"
	},
	done: {
		label: "做完这步",
		tone: "done",
		icon: "✓",
		hint: "它这一步做完了，后面还有"
	},
	merged: {
		label: "完成",
		tone: "ok",
		icon: "✔",
		hint: "这一步完成了"
	},
	fixing: {
		label: "返工",
		tone: "fix",
		icon: "↻",
		hint: "被退回或没过，在改"
	},
	failed: {
		label: "没过",
		tone: "bad",
		icon: "✕",
		hint: "被拒或失败了"
	},
	skipped: {
		label: "这次不需要",
		tone: "idle",
		icon: "–",
		hint: "这个需求的路上没有这一步"
	}
};
function mt(e) {
	return pt[e] ?? {
		label: String(e),
		tone: "idle",
		icon: "•",
		hint: ""
	};
}
var ht = (e) => e === "merged" || e === "skipped", gt = /* @__PURE__ */ new Set(["running", "fixing"]), _t = /* @__PURE__ */ new Set([
	"running",
	"fixing",
	"stalled",
	"awaiting_approval"
]), vt = {
	claim: {
		icon: "🏷️",
		label: "认领",
		tone: "info"
	},
	start: {
		icon: "🏁",
		label: "开工",
		tone: "run"
	},
	stage: {
		icon: "🧭",
		label: "Lean 阶段",
		tone: "idle"
	},
	request: {
		icon: "✋",
		label: "请求批准",
		tone: "approve"
	},
	approve: {
		icon: "👍",
		label: "批准",
		tone: "ok"
	},
	reject: {
		icon: "↩️",
		label: "退回",
		tone: "bad"
	},
	refused: {
		icon: "🚫",
		label: "口令没被接受",
		tone: "warn"
	},
	blocked: {
		icon: "🛑",
		label: "Lean 拦下",
		tone: "warn"
	},
	commit: {
		icon: "📝",
		label: "提交",
		tone: "info"
	},
	handover: {
		icon: "📨",
		label: "交接",
		tone: "handoff"
	},
	accepted: {
		icon: "🤝",
		label: "桥接手",
		tone: "ok"
	},
	rejected: {
		icon: "⛔",
		label: "接手被拒",
		tone: "bad"
	},
	signed: {
		icon: "🔏",
		label: "签名",
		tone: "handoff"
	},
	question: {
		icon: "❓",
		label: "问人",
		tone: "approve"
	},
	answer: {
		icon: "💬",
		label: "回答",
		tone: "ok"
	},
	verify: {
		icon: "🧪",
		label: "verify",
		tone: "info"
	},
	merge: {
		icon: "⤵️",
		label: "合并",
		tone: "ok"
	},
	reflect: {
		icon: "📚",
		label: "回写 Brain",
		tone: "ok"
	},
	session: {
		icon: "💻",
		label: "会话",
		tone: "run"
	},
	app: {
		icon: "•",
		label: "app",
		tone: "idle"
	}
}, yt = {
	person: "你",
	branch: "运行分支",
	checks: "检查"
};
function bt(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 60) return `${t} 秒`;
	let n = Math.round(t / 60);
	if (n < 60) return `${n} 分钟`;
	let r = Math.floor(n / 60);
	if (r < 24) return n % 60 ? `${r} 小时 ${n % 60} 分` : `${r} 小时`;
	let i = Math.floor(r / 24);
	return r % 24 ? `${i} 天 ${r % 24} 小时` : `${i} 天`;
}
function xt(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 5) return "刚刚";
	if (t < 60) return `${t} 秒前`;
	let n = Math.floor(t / 60);
	if (n < 60) return `${n} 分钟前`;
	let r = Math.floor(n / 60);
	return r < 24 ? `${r} 小时前` : `${Math.floor(r / 24)} 天前`;
}
function St(e) {
	return e == null || !Number.isFinite(e) ? "—" : e >= 100 ? String(Math.round(e)) : (Math.round(e * 10) / 10).toFixed(1);
}
var Ct = (e) => String(e).padStart(2, "0");
function X(e) {
	if (e == null || !Number.isFinite(e)) return "—";
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${Ct(t.getMonth() + 1)}-${Ct(t.getDate())} ${Ct(t.getHours())}:${Ct(t.getMinutes())}`;
}
function wt(e) {
	let t = 0;
	for (let n of e) t += Tt(n);
	return t;
}
function Tt(e) {
	let t = e.codePointAt(0) ?? 0;
	return t === 32 ? .3 : t > 126976 ? 1.2 : t >= 11904 && t <= 40959 || t >= 65280 && t <= 65519 || t >= 12288 && t <= 12351 ? 1 : .58;
}
function Et(e, t) {
	if (wt(e) <= t) return e;
	let n = "", r = 0;
	for (let i of e) {
		let e = Tt(i);
		if (r + e > t - .8) break;
		n += i, r += e;
	}
	return `${n.trimEnd()}…`;
}
function Dt(e, t) {
	return e.from === t || e.to === t;
}
var Ot = [
	{
		key: "gate",
		label: "Lean 审批"
	},
	{
		key: "verify",
		label: "verify"
	},
	{
		key: "handover",
		label: "交接"
	},
	{
		key: "brain",
		label: "Brain 和仓库"
	},
	{
		key: "after",
		label: "合并以后"
	}
], kt = {
	pass: {
		label: "通过",
		glyph: "✓"
	},
	fail: {
		label: "没过",
		glyph: "✕"
	},
	wait: {
		label: "等人",
		glyph: "✋"
	},
	skip: {
		label: "还没到",
		glyph: "–"
	}
}, At = {
	not_yet: {
		label: "还没到验收",
		tone: "idle"
	},
	waiting: {
		label: "等验收",
		tone: "approve"
	},
	accepted: {
		label: "验收过了",
		tone: "ok"
	},
	rejected: {
		label: "验收被退回",
		tone: "bad"
	},
	merged: {
		label: "已合并",
		tone: "ok"
	}
};
function jt({ board: e, onDetail: t, onBrain: n, quiet: r = !1 }) {
	let i = u(), a = e.accept, o = e.mr_desc, { copied: s, copy: c } = dt(o.text), l = At[a.state], d = e.decisions.filter((e) => e.by === "person"), f = a.by.reduce((e, t) => e + t.count, 0), h = a.state === "merged" || a.state === "accepted";
	return /* @__PURE__ */ m("section", {
		id: "br-accept",
		className: `kt-sign${h ? " is-signed" : ""}${a.state === "not_yet" ? " is-idle" : ""}`,
		"aria-label": "验收",
		"data-testid": "br-accept",
		children: [
			/* @__PURE__ */ m("header", {
				className: "kt-sign-head",
				children: [
					/* @__PURE__ */ p("h2", { children: "验收" }),
					/* @__PURE__ */ p("span", {
						className: `kt-pill tone-${l.tone}`,
						children: l.label
					}),
					/* @__PURE__ */ p("p", {
						className: "kt-dim",
						children: "合并前由人确认：变更、决定、检查"
					})
				]
			}),
			/* @__PURE__ */ m("dl", {
				className: "kt-sign-grid",
				children: [
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "需求" }), /* @__PURE__ */ m("dd", { children: [
						/* @__PURE__ */ p("b", {
							className: "br-strong",
							children: e.row.key
						}),
						" ",
						e.row.title
					] })] }),
					/* @__PURE__ */ m("div", {
						className: "br-accept-desc",
						children: [/* @__PURE__ */ m("dt", { children: [
							"变更说明 ",
							o.text && !r && /* @__PURE__ */ m("button", {
								type: "button",
								className: "br-link br-small",
								onClick: () => void c(),
								children: [/* @__PURE__ */ p(H, {
									name: "Copy",
									size: 12
								}), "复制"]
							}),
							s === "ok" && /* @__PURE__ */ p("span", {
								className: "br-ok-text br-small",
								role: "status",
								children: " 已复制"
							})
						] }), /* @__PURE__ */ m("dd", { children: [o.first ? /* @__PURE__ */ p("span", {
							"data-testid": "accept-first",
							children: o.first
						}) : /* @__PURE__ */ p("span", {
							className: "br-dim",
							children: o.error || "还没有"
						}), o.text && /* @__PURE__ */ m("details", {
							className: "br-raw",
							children: [/* @__PURE__ */ p("summary", { children: "看全文" }), /* @__PURE__ */ p("pre", { children: o.text })]
						})] })]
					}),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "检查" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ p("b", {
						className: e.checks.failed ? "kt-bad" : e.checks.total && e.checks.passed === e.checks.total ? "kt-ok" : "",
						children: a.checks
					}) })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "决定 · 谁定的" }), /* @__PURE__ */ p("dd", { children: f ? /* @__PURE__ */ p("ul", {
						className: "kt-sign-groups",
						children: a.by.map((e) => /* @__PURE__ */ m("li", {
							className: e.id === "person" ? "is-ok" : e.id === "unclassified" ? "is-bad" : "",
							children: [
								e.label,
								" ",
								e.count
							]
						}, e.id))
					}) : "还没有记下决定" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "人做的决定" }), /* @__PURE__ */ p("dd", { children: d.length ? /* @__PURE__ */ p("ul", { children: d.slice(0, 4).map((e) => /* @__PURE__ */ m("li", { children: [
						/* @__PURE__ */ p("b", { children: e.id }),
						" ",
						e.text,
						e.who ? `（${e.who}）` : ""
					] }, e.id)) }) : "（这次没有人拍板的决定）" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "花了多少" }), /* @__PURE__ */ m("dd", { children: [
						e.credits.total === null ? "credits 还没报" : `${e.credits.total} credits`,
						" · ",
						e.sessions.length,
						" 个会话",
						e.row.run_ids.length ? ` · ${e.row.run_ids.join("、")}` : ""
					] })] })
				]
			}),
			a.done ? /* @__PURE__ */ m("p", {
				className: "kt-sign-done",
				role: "status",
				children: [
					/* @__PURE__ */ p(V, {
						role: "merge",
						size: 16
					}),
					" ",
					a.done.who ? /* @__PURE__ */ p("b", { children: a.done.who }) : null,
					" ",
					X(a.done.at),
					" ",
					a.done.how,
					t && /* @__PURE__ */ p("button", {
						type: "button",
						className: "kt-btn kt-sign-cto",
						onClick: t,
						children: "需求详情 ↗"
					})
				]
			}) : null,
			!r && a.step.text ? /* @__PURE__ */ m("div", {
				className: "br-step",
				"data-testid": "accept-step",
				children: [
					/* @__PURE__ */ m("span", {
						className: "br-step-who",
						children: [
							/* @__PURE__ */ p(V, {
								role: "person",
								size: 16
							}),
							a.step.who || "你",
							"要做的一步"
						]
					}),
					/* @__PURE__ */ p("p", {
						className: "br-strong br-pre",
						children: a.step.text
					}),
					a.step.line && /* @__PURE__ */ p(q, {
						line: a.step.line,
						sessionUrl: a.step.session_url
					}),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [
							a.step.mr_url && /* @__PURE__ */ p(K, {
								href: a.step.mr_url,
								className: "kt-btn is-primary br-extbtn",
								children: "去 MR ↗"
							}),
							!a.step.line && a.step.session_url && /* @__PURE__ */ p("button", {
								type: "button",
								className: "kt-btn",
								onClick: () => i(a.step.session_url),
								children: "打开会话"
							}),
							/Brain/.test(a.step.text) && n && /* @__PURE__ */ p("button", {
								type: "button",
								className: "kt-btn is-primary",
								onClick: n,
								children: "去 Brain 回写 ↗"
							})
						]
					})
				]
			}) : !r && !a.done ? /* @__PURE__ */ m("p", {
				className: "kt-sign-blocked",
				role: "status",
				children: ["此刻不用你做什么：", e.person.doing]
			}) : null
		]
	});
}
var Mt = 5e3, Nt = 1500;
function Pt(e) {
	return e === "bounce" || e === "fail" ? "cross" : e === "pass" || e === "merge" ? "check" : "ring";
}
var Ft = class {
	now;
	spreadMs;
	base;
	seen = /* @__PURE__ */ new Set();
	order = [];
	queue = [];
	active = [];
	nextId = 1;
	skipToggle = !1;
	calmSince = null;
	hiddenAt = null;
	level;
	dropped = {
		duplicate: 0,
		merged: 0,
		admission: 0,
		level: 0,
		expired: 0
	};
	constructor(e) {
		this.now = e.now, this.spreadMs = e.spreadMs ?? 1600, this.base = e.reducedMotion ? 3 : 0, this.level = this.base;
	}
	get reducedMotion() {
		return this.base === 3;
	}
	get busy() {
		return this.hiddenAt === null && (this.queue.length > 0 || this.active.length > 0);
	}
	history(e) {
		for (let t of e) this.seen.has(t.key) || this.remember(t.key);
	}
	ingest(e, t = this.now()) {
		let n = [];
		for (let t of e) this.seen.has(t.key) ? this.dropped.duplicate++ : (this.remember(t.key), n.push(t));
		if (!n.length) return n;
		let r = Math.min(...n.map((e) => e.t)), i = (Math.max(...n.map((e) => e.t)) - r) * 1e3, a = i > this.spreadMs ? this.spreadMs / i : 1;
		for (let e of n) this.queue.push({
			...e,
			playAt: t + (e.t - r) * 1e3 * a
		});
		return this.queue.sort((e, t) => e.playAt - t.playAt), n;
	}
	frame(e = this.now()) {
		if (this.hiddenAt !== null) return {
			particles: [],
			level: this.level
		};
		for (; this.queue.length && this.queue[0].playAt <= e;) {
			let t = this.queue.shift();
			this.spawn(t, Math.max(t.playAt, e - 100));
		}
		let t = [];
		for (let n of this.active) e - n.start < n.dur ? t.push(n) : n.travel && t.push({
			...n,
			id: this.nextId++,
			from: n.to,
			travel: !1,
			shape: Pt(n.tone),
			start: n.start + n.dur,
			dur: 850
		});
		return this.active = t.filter((t) => e - t.start < t.dur), {
			particles: this.active.map((t) => ({
				...t,
				p: Math.min(1, Math.max(0, (e - t.start) / t.dur))
			})),
			level: this.level
		};
	}
	report(e, t = this.now()) {
		this.base !== 3 && (e > 2 ? (this.level = Math.min(3, this.level + 1), this.calmSince = null) : e < 1.5 ? this.calmSince === null ? this.calmSince = t : t - this.calmSince >= 5e3 && this.level > this.base && (--this.level, this.calmSince = t) : this.calmSince = null);
	}
	setHidden(e, t = this.now()) {
		if (e) {
			this.hiddenAt === null && (this.hiddenAt = t);
			return;
		}
		if (this.hiddenAt === null) return;
		this.hiddenAt = null;
		let n = this.queue.filter((e) => t - e.playAt > Mt);
		this.dropped.expired += n.length, this.queue = this.queue.filter((e) => t - e.playAt <= Mt), this.active = this.active.filter((e) => t - e.start < e.dur);
	}
	remember(e) {
		this.seen.add(e), this.order.push(e), this.order.length > 2048 && this.seen.delete(this.order.shift());
	}
	spawn(e, t) {
		if (this.level >= 3 || this.level >= 2 && e.prio < 2 || this.level === 1 && e.prio < 3 && (this.skipToggle = !this.skipToggle, this.skipToggle)) {
			this.dropped.level++;
			return;
		}
		let n = `${e.kind}|${e.from}|${e.to}`, r = this.active.find((e) => `${e.kind}|${e.from}|${e.to}` === n && Math.abs(t - e.start) < 250);
		if (r) {
			r.count++, r.prio = Math.max(r.prio, e.prio), this.dropped.merged++;
			return;
		}
		let i = `${e.from}>${e.to}`, a = this.active.filter((e) => `${e.from}>${e.to}` === i);
		if (a.length >= 4 && !this.evict(a, e.prio) || this.active.length >= 32 && !this.evict(this.active, e.prio)) {
			this.dropped.admission++;
			return;
		}
		let o = e.from !== e.to;
		this.active.push({
			...e,
			id: this.nextId++,
			start: t,
			dur: o ? Nt : 900,
			count: 1,
			travel: o
		});
	}
	evict(e, t) {
		let n = e.filter((e) => e.prio < 3 && e.prio < t).sort((e, t) => e.prio - t.prio || e.start - t.start)[0];
		return n ? (this.active = this.active.filter((e) => e !== n), this.dropped.admission++, !0) : t === 3;
	}
};
//#endregion
//#region src/board/hooks.ts
function It(e) {
	let t = a(e);
	return t.current = e, t;
}
var Lt = "(prefers-reduced-motion: reduce)";
function Rt() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" && !!window.matchMedia(Lt)?.matches;
	} catch {
		return !1;
	}
}
function zt() {
	let [e, t] = o(Rt);
	return r(() => {
		if (typeof window.matchMedia != "function") return;
		let e = window.matchMedia(Lt);
		if (!e) return;
		let n = () => t(!!e.matches);
		return e.addEventListener?.("change", n), () => e.removeEventListener?.("change", n);
	}, []), e;
}
var Bt = /* @__PURE__ */ new Set(), Vt = null, Ht = Date.now();
function Ut(e) {
	return Bt.add(e), Vt ||= (Ht = Date.now(), setInterval(() => {
		if (!(typeof document < "u" && document.hidden)) {
			Ht = Date.now();
			for (let e of Bt) e();
		}
	}, 1e3)), () => {
		Bt.delete(e), !Bt.size && Vt && (clearInterval(Vt), Vt = null);
	};
}
function Wt() {
	return s(Ut, () => Ht, () => Ht);
}
var Gt = e({
	at: Date.now() / 1e3,
	receivedAt: Date.now()
});
function Kt() {
	let { at: e, receivedAt: t } = n(Gt), r = Wt();
	return e + Math.max(0, r - t) / 1e3;
}
function qt(e, t = 900, n = !1) {
	let [i, s] = o(e), c = a(e), l = It(i);
	return r(() => {
		if (n || typeof requestAnimationFrame != "function") {
			s(e);
			return;
		}
		if (c.current = l.current, c.current === e) return;
		let r = performance.now(), i = 0, a = () => {
			let n = Math.min(1, (performance.now() - r) / t), o = 1 - (1 - n) ** 3;
			s(c.current + (e - c.current) * o), n < 1 && (i = requestAnimationFrame(a));
		};
		return i = requestAnimationFrame(a), () => cancelAnimationFrame(i);
	}, [
		e,
		t,
		n,
		l
	]), i;
}
function Jt(e) {
	let t = a({
		v: e,
		n: 0
	});
	return Object.is(t.current.v, e) || (t.current = {
		v: e,
		n: t.current.n + 1
	}), t.current.n;
}
//#endregion
//#region src/board/layout.ts
var Yt = 1640, Xt = 98, Zt = 24, Qt = 124, $t = 12, en = 26, tn = {
	w: 132,
	h: 76
}, nn = {
	top: 26,
	title: 16,
	group: 17,
	row: 16,
	gap: 3
}, rn = [
	{
		key: "local",
		n: "1",
		title: "本机 · Lean",
		en: "Local",
		sub: "brain-dev 会话 · 需求和设计审批"
	},
	{
		key: "runner",
		n: "2",
		title: "交给运行机",
		en: "Team runner",
		sub: "brain handoff · 桥核对 · 签名 · brain-run"
	},
	{
		key: "check",
		n: "3",
		title: "检查 · 验收",
		en: "Checks",
		sub: "verify · 发布审批 · 验收"
	},
	{
		key: "land",
		n: "4",
		title: "回写",
		en: "Brain",
		sub: "合并以后 · brain reflect"
	}
], an = {
	local: {
		col: 0,
		half: 2,
		row: 0,
		phase: "local"
	},
	req: {
		col: 1,
		half: 1,
		row: 0,
		phase: "local"
	},
	design: {
		col: 1,
		half: 3,
		row: 1,
		phase: "local"
	},
	handover: {
		col: 2,
		half: 0,
		row: 0,
		phase: "runner"
	},
	bridge: {
		col: 2,
		half: 2,
		row: 1,
		phase: "runner"
	},
	signer: {
		col: 2,
		half: 4,
		row: 2,
		phase: "runner"
	},
	runner: {
		col: 3,
		half: 2,
		row: 0,
		phase: "runner"
	},
	ci: {
		col: 4,
		half: 1,
		row: 0,
		phase: "check"
	},
	release: {
		col: 4,
		half: 3,
		row: 1,
		phase: "check"
	},
	reflect: {
		col: 5,
		half: 2,
		row: 0,
		phase: "land"
	}
}, on = 6, Z = (e) => Math.round(e * 10) / 10;
function sn(e, t) {
	let n = 1 - t, r = n * n * n, i = 3 * n * n * t, a = 3 * n * t * t, o = t * t * t;
	return {
		x: r * e[0].x + i * e[1].x + a * e[2].x + o * e[3].x,
		y: r * e[0].y + i * e[1].y + a * e[2].y + o * e[3].y
	};
}
var cn = (e, t, n) => ({
	x: e.x + (t.x - e.x) * n,
	y: e.y + (t.y - e.y) * n
}), ln = (e, t) => [
	e,
	cn(e, t, 1 / 3),
	cn(e, t, 2 / 3),
	t
];
function un(e, t) {
	let n = (t.x - e.x) / 2;
	return [
		e,
		{
			x: e.x + n,
			y: e.y
		},
		{
			x: t.x - n,
			y: t.y
		},
		t
	];
}
var dn = (e, t) => [
	e,
	{
		x: t.x,
		y: e.y
	},
	{
		x: t.x,
		y: e.y
	},
	t
], fn = (e, t) => [
	e,
	{
		x: e.x,
		y: t.y
	},
	{
		x: e.x,
		y: t.y
	},
	t
];
function pn(e) {
	return e.slice().reverse().map((e) => [
		e[3],
		e[2],
		e[1],
		e[0]
	]);
}
function mn(e) {
	if (!e.length) return "";
	let t = (e) => `${Z(e.x)},${Z(e.y)}`;
	return `M${t(e[0][0])}${e.map((e) => ` C${t(e[1])} ${t(e[2])} ${t(e[3])}`).join("")}`;
}
function hn(e) {
	let t = e.map((e) => {
		let t = 0, n = e[0];
		for (let r = 1; r <= 12; r++) {
			let i = sn(e, r / 12);
			t += Math.hypot(i.x - n.x, i.y - n.y), n = i;
		}
		return t;
	});
	return {
		segs: e,
		lens: t,
		total: t.reduce((e, t) => e + t, 0)
	};
}
function gn(e, t) {
	let n = e.segs.length;
	if (!n) return {
		x: 0,
		y: 0
	};
	let r = Math.min(1, Math.max(0, t)) * e.total;
	for (let t = 0; t < n; t++) {
		let i = e.lens[t];
		if (r <= i || t === n - 1) return sn(e.segs[t], i > 0 ? Math.min(1, r / i) : 1);
		r -= i;
	}
	return e.segs[n - 1][3];
}
function _n(e, t, n, r, i) {
	if (e.stage === t.stage) {
		let n = t.y > e.y;
		return [ln({
			x: e.x,
			y: e.y + (n ? 40 : -40)
		}, {
			x: t.x,
			y: t.y + (n ? -40 : 40)
		})];
	}
	let a = {
		x: e.x + 92,
		y: e.y
	}, o = {
		x: t.x - 92,
		y: t.y
	}, s = [a];
	for (let c = e.stage + 1; c < t.stage; c++) {
		let e = n[c], t = (e.x - a.x) / (o.x - a.x || 1), l = a.y + (o.y - a.y) * t, u = e.keys.map((e) => r.get(e)).sort((e, t) => e.y - t.y).map((e) => [e.y - 40 - $t, e.y + 40 + $t + en]).reduce((e, t) => {
			let n = e[e.length - 1];
			return n && t[0] <= n[1] ? n[1] = Math.max(n[1], t[1]) : e.push([...t]), e;
		}, []), d = 0;
		for (let [e, t] of u) if (l > e && l < t) {
			d = l - e < t - l ? -1 : 1, l = d < 0 ? e : t;
			break;
		}
		let f = `${c}:${Math.round(l)}`, p = i.get(f) ?? 0;
		i.set(f, p + 1), p && (l += (d || (p % 2 ? 1 : -1)) * 7 * (d ? p : Math.ceil(p / 2))), s.push({
			x: e.x - 92 - 10,
			y: l
		}, {
			x: e.x + 92 + 10,
			y: l
		});
	}
	s.push(o);
	let c = [];
	for (let e = 0; e < s.length - 1; e++) c.push(e % 2 == 1 ? ln(s[e], s[e + 1]) : un(s[e], s[e + 1]));
	return c;
}
function vn(e, t) {
	let n = [
		["local", "req"],
		["local", "design"],
		["req", "handover"],
		["design", "handover"],
		["handover", "bridge"],
		["bridge", "signer"],
		["signer", "runner"],
		["runner", "ci"],
		["ci", "release"],
		["release", "reflect"]
	];
	return t && n.push(["design", "ci"]), n.filter(([t, n]) => e.has(t) && e.has(n));
}
function yn(e, t, n = 0) {
	let r = Yt, i = Array.from({ length: on }, (e, t) => ({
		index: t,
		x: Z(292 + t * 237.2),
		keys: [],
		phase: ""
	})), a = /* @__PURE__ */ new Map(), o = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = an[t];
		if (!e) continue;
		let n = i[e.col];
		n.keys.push(t), n.phase = e.phase, a.set(t, {
			key: t,
			stage: e.col,
			row: e.row,
			x: n.x,
			y: Z(138 + e.half * Qt / 2)
		}), o.set(t, Z(n.x + 92 + 18 + 20 * Math.min(1, e.row)));
	}
	let s = Xt + tn.h - 6 + nn.top + nn.title + n * nn.row + nn.group + nn.gap, c = Math.max(488, s + 40), l = /* @__PURE__ */ new Map(), u = [];
	for (let [e, n] of t) {
		let t = a.get(e), r = a.get(n);
		if (!t || !r || e === n) continue;
		let o = _n(t, r, i, a, l);
		u.push({
			from: e,
			to: n,
			path: o,
			d: mn(o)
		});
	}
	let d = {
		x: 1598,
		y: c,
		r: 28
	}, f = [];
	for (let e of rn) {
		let t = i.filter((t) => bn[e.key]?.includes(t.index));
		t.length && f.push({
			...e,
			x1: Z(t[0].x - 92 - 14),
			x2: Z(t[t.length - 1].x + 92 + 14),
			used: t.some((e) => e.keys.length > 0)
		});
	}
	for (let e = 1; e < f.length; e++) {
		let t = (f[e - 1].x2 - 14 + f[e].x1 + 14) / 2;
		f[e - 1].x2 = Z(Math.min(f[e - 1].x2, t - 4)), f[e].x1 = Z(Math.max(f[e].x1, t + 4));
	}
	f.unshift({
		key: "init",
		n: "0",
		title: "你",
		en: "Owner",
		sub: "认领 · 文档过五关 · 开工",
		x1: 8,
		x2: Z((f[0]?.x1 ?? 200) - 8),
		used: !0
	});
	let p = {
		x: Z(102),
		y: Xt + tn.h / 2 - 6
	};
	return {
		width: r,
		height: c + 44,
		nodes: a,
		stages: i,
		edges: u,
		rail: {
			x1: Zt,
			x2: d.x - 28,
			y: c
		},
		station: d,
		mergeX: o,
		phases: f,
		orch: p
	};
}
var bn = {
	local: [0, 1],
	runner: [2, 3],
	check: [4],
	land: [5]
}, xn = "tests", Sn = "orch";
function Cn(e, t, n) {
	if (t === "tests") return {
		x: e.station.x,
		y: e.station.y
	};
	if (t === "run") return {
		x: n,
		y: e.rail.y
	};
	if (t === "orch") return e.orch;
	let r = e.nodes.get(t);
	return r ? {
		x: r.x,
		y: r.y
	} : null;
}
function wn(e, t, n) {
	if (t === "tests") return {
		x: e.station.x,
		y: e.station.y,
		w: e.station.r * 2,
		h: e.station.r * 2,
		rx: e.station.r
	};
	if (t === "run") return {
		x: n,
		y: e.rail.y,
		w: 22,
		h: 22,
		rx: 11
	};
	if (t === "orch") return {
		...e.orch,
		w: tn.w,
		h: tn.h,
		rx: 18
	};
	let r = e.nodes.get(t);
	return r ? {
		x: r.x,
		y: r.y,
		w: 184,
		h: 80,
		rx: 16
	} : null;
}
var Tn = 68;
function En(e, t) {
	let n = e.orch, r = e.nodes.get(t);
	if (!r) return null;
	let i = {
		x: n.x + tn.w / 2,
		y: n.y
	}, a = r.x - 92 - 18, o = {
		x: Math.min(i.x + 28, a - 18),
		y: Tn
	}, s = {
		x: a,
		y: Math.max(86, r.y - 18)
	}, c = {
		x: r.x - 92,
		y: r.y
	};
	return [
		un(i, o),
		ln(o, {
			x: a - 18,
			y: Tn
		}),
		dn({
			x: a - 18,
			y: Tn
		}, s),
		fn(s, c)
	];
}
function Dn(e, t) {
	let n = e.nodes.get(t), r = e.mergeX.get(t);
	if (!n || r === void 0) return null;
	let i = {
		x: n.x + 92,
		y: n.y
	}, a = {
		x: r,
		y: n.y + 24
	};
	return [dn(i, a), ln(a, {
		x: r,
		y: e.rail.y
	})];
}
function On(e, t, n, r) {
	if (t === n) return null;
	let i = e.station;
	if (t === "orch" && e.nodes.has(n)) return En(e, n);
	if (n === "orch" && e.nodes.has(t)) {
		let n = En(e, t);
		return n ? pn(n) : null;
	}
	if (n === "run" && e.nodes.has(t)) return Dn(e, t);
	if (t === "run" && n === "tests") return [ln({
		x: Math.min(r, i.x - i.r - 20),
		y: e.rail.y
	}, {
		x: i.x - i.r,
		y: e.rail.y
	})];
	if (t === "tests" && e.nodes.has(n)) {
		let t = Dn(e, n), r = e.mergeX.get(n);
		return !t || r === void 0 ? null : [ln({
			x: i.x - i.r,
			y: e.rail.y
		}, {
			x: r,
			y: e.rail.y
		}), ...pn(t)];
	}
	if (e.nodes.has(t) && e.nodes.has(n)) {
		let r = e.edges.find((e) => e.from === t && e.to === n);
		if (r) return r.path;
		let i = e.edges.find((e) => e.from === n && e.to === t);
		if (i) return pn(i.path);
		let a = e.nodes.get(t), o = e.nodes.get(n);
		return a.stage === o.stage ? [ln({
			x: a.x,
			y: a.y + (o.y > a.y ? 40 : -40)
		}, {
			x: o.x,
			y: o.y + (o.y > a.y ? -40 : 40)
		})] : o.x >= a.x ? [un({
			x: a.x + 92,
			y: a.y
		}, {
			x: o.x - 92,
			y: o.y
		})] : [un({
			x: a.x - 92,
			y: a.y
		}, {
			x: o.x + 92,
			y: o.y
		})];
	}
	let a = Cn(e, t, r), o = Cn(e, n, r);
	return a && o ? [un(a, o)] : null;
}
function kn(e, t) {
	for (let n = t.length - 1; n >= 0; n--) {
		let r = e.mergeX.get(t[n].actor);
		if (r !== void 0) return r;
	}
	return e.rail.x1 + 120;
}
//#endregion
//#region src/board/overlay.ts
var An = "http://www.w3.org/2000/svg", jn = 9, Mn = 96, Nn = (e) => typeof requestAnimationFrame == "function" ? requestAnimationFrame(e) : setTimeout(() => e(performance.now()), 16), Pn = (e) => typeof cancelAnimationFrame == "function" ? cancelAnimationFrame(e) : clearTimeout(e), Fn = (e) => e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2, In = (e) => 1 - (1 - e) ** 3, Q = (e) => e.toFixed(1), Ln = class {
	group;
	engine;
	opts;
	pool = [];
	routes = /* @__PURE__ */ new Map();
	handle = null;
	stopped = !1;
	constructor(e, t, n) {
		this.group = e, this.engine = t, this.opts = n;
	}
	get running() {
		return this.handle !== null;
	}
	wake() {
		!this.stopped && this.handle === null && this.engine.busy && (this.handle = (this.opts.raf ?? Nn)(this.tick));
	}
	dispose() {
		this.stopped = !0, this.handle !== null && (this.opts.caf ?? Pn)(this.handle), this.handle = null;
		for (let e of this.pool) e.remove();
		this.pool.length = 0, this.routes.clear();
	}
	tick = () => {
		this.handle = null;
		let e = this.opts.perf ?? (() => performance.now()), t = e(), n = this.engine.frame(this.opts.now());
		this.draw(n.particles), this.engine.report(e() - t), this.opts.onFrame?.(n), this.engine.busy && !this.stopped ? this.handle = (this.opts.raf ?? Nn)(this.tick) : this.hideFrom(0);
	};
	shape(e) {
		let t = this.pool[e];
		if (t) return t;
		let n = document.createElementNS(An, "g"), r = (e) => {
			let t = document.createElementNS(An, "circle");
			return t.setAttribute("class", e), t;
		}, i = (e, t) => {
			let n = document.createElementNS(An, "path");
			return n.setAttribute("class", e), n.setAttribute("d", t), n;
		}, a = (e) => {
			let t = document.createElementNS(An, "polyline");
			return t.setAttribute("class", e), t;
		}, o = document.createElementNS(An, "rect");
		o.setAttribute("class", "kt-p-ring");
		let s = document.createElementNS(An, "text");
		return s.setAttribute("class", "kt-p-label"), s.setAttribute("text-anchor", "middle"), n.append(a("kt-p-tail-glow"), a("kt-p-tail"), r("kt-p-halo"), r("kt-p-head"), o, i("kt-p-cross", "M-6,-6 L6,6 M6,-6 L-6,6"), i("kt-p-check", "M-6,0 L-2,4.5 L6.5,-5"), s), this.group.appendChild(n), this.pool[e] = n, n;
	}
	route(e) {
		if (this.routes.has(e.id)) return this.routes.get(e.id) ?? null;
		let t = this.opts.path(e.from, e.to), n = t && t.length ? hn(t) : null;
		return this.routes.set(e.id, n), n;
	}
	draw(e) {
		let t = /* @__PURE__ */ new Set(), n = 0;
		for (let r of e) {
			if (t.add(r.id), r.travel) {
				let e = this.route(r);
				if (!e) continue;
				let t = this.shape(n++);
				this.mark(t, r);
				let i = Math.min(1.8, 1 + .25 * (r.count - 1)) * (r.prio >= 3 ? 1.15 : 1), a = Fn(r.p), o = gn(e, a), s = t.children, c = Math.min(a, Mn / Math.max(1, e.total)), l = [];
				for (let t = 0; t <= jn; t++) {
					let n = gn(e, a - c + c * t / jn);
					l.push(`${Q(n.x)},${Q(n.y)}`);
				}
				let u = l.join(" ");
				for (let e of [0, 1]) s[e].setAttribute("points", u), s[e].setAttribute("stroke-width", Q((e === 0 ? 9 : 3.2) * i)), s[e].setAttribute("display", "inline");
				Rn(s[2], o, 12 * i), Rn(s[3], o, 5.4 * i);
				for (let e = 4; e < 7; e++) s[e].setAttribute("display", "none");
				let d = s[7];
				r.label ? (d.textContent !== r.label && (d.textContent = r.label), d.setAttribute("x", Q(o.x)), d.setAttribute("y", Q(o.y - 15 * i)), d.setAttribute("display", "inline")) : d.setAttribute("display", "none"), t.setAttribute("opacity", Q(Math.min(1, r.p / .06, (1 - r.p) / .08 + .35)));
				continue;
			}
			let e = this.opts.box(r.to);
			if (!e) continue;
			let i = this.shape(n++);
			this.mark(i, r);
			let a = i.children;
			for (let e of [
				0,
				1,
				2,
				3,
				7
			]) a[e].setAttribute("display", "none");
			let o = In(r.p), s = (r.shape === "spark" ? 7 : 26) * Math.min(1.6, 1 + .2 * (r.count - 1)) * o, c = a[4];
			c.setAttribute("x", Q(e.x - e.w / 2 - s)), c.setAttribute("y", Q(e.y - e.h / 2 - s)), c.setAttribute("width", Q(e.w + 2 * s)), c.setAttribute("height", Q(e.h + 2 * s)), c.setAttribute("rx", Q(e.rx + s / 2)), c.setAttribute("stroke-width", Q(r.shape === "spark" ? 2 : 4 - 2.5 * o)), c.setAttribute("display", "inline");
			let l = r.shape === "cross" ? a[5] : r.shape === "check" ? a[6] : null;
			for (let e of [5, 6]) a[e] !== l && a[e].setAttribute("display", "none");
			l && (l.setAttribute("display", "inline"), l.setAttribute("transform", `translate(${Q(e.x + e.w / 2 - 4)},${Q(e.y - e.h / 2 - 6 - 10 * o)}) scale(${(1.7 - .5 * o).toFixed(2)})`)), i.setAttribute("opacity", Q(1 - r.p * r.p));
		}
		for (let e of [...this.routes.keys()]) t.has(e) || this.routes.delete(e);
		this.hideFrom(n);
	}
	mark(e, t) {
		e.setAttribute("class", `kt-p is-${t.tone}${t.travel ? " is-travel" : " is-blip"}`), e.setAttribute("data-src", t.key), e.setAttribute("data-kind", t.kind), e.removeAttribute("display");
	}
	hideFrom(e) {
		for (let t = e; t < this.pool.length; t++) {
			let e = this.pool[t];
			e.getAttribute("display") !== "none" && (e.setAttribute("display", "none"), e.removeAttribute("data-src"));
		}
	}
};
function Rn(e, t, n) {
	e.setAttribute("cx", Q(t.x)), e.setAttribute("cy", Q(t.y)), e.setAttribute("r", Q(n)), e.setAttribute("display", "inline");
}
//#endregion
//#region src/board/NodeCard.tsx
function zn({ a: e, onSession: t }) {
	let n = mt(e.status);
	return /* @__PURE__ */ m("div", {
		className: "kt-ncard-body",
		children: [
			/* @__PURE__ */ m("p", {
				className: "kt-ncard-head",
				children: [
					/* @__PURE__ */ p(V, {
						role: e.icon,
						size: 16
					}),
					" ",
					/* @__PURE__ */ p("b", { children: e.title }),
					/* @__PURE__ */ p("span", {
						className: `kt-pill tone-${n.tone}`,
						children: n.label
					})
				]
			}),
			/* @__PURE__ */ m("p", {
				className: "kt-ncard-task",
				children: [
					/* @__PURE__ */ p("span", {
						className: "kt-dim",
						children: "是什么"
					}),
					" ",
					e.sub
				]
			}),
			/* @__PURE__ */ p("p", {
				className: e.status === "awaiting_approval" || e.status === "failed" ? "kt-ncard-back" : "kt-ncard-did",
				children: e.doing
			}),
			/* @__PURE__ */ m("ul", {
				className: "kt-ncard-facts",
				children: [
					e.since !== null && /* @__PURE__ */ m("li", { children: [
						"从 ",
						X(e.since),
						" 起"
					] }),
					e.facts.map((e) => /* @__PURE__ */ p("li", { children: e }, e)),
					e.credits !== null && /* @__PURE__ */ m("li", { children: [St(e.credits), " credits"] }),
					e.line && /* @__PURE__ */ m("li", { children: ["要你自己在会话里打：", /* @__PURE__ */ p("code", { children: e.line })] })
				]
			}),
			e.session && t && /* @__PURE__ */ p("div", {
				className: "kt-ncard-actions",
				children: /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => t(e.session.url),
					children: "打开会话"
				})
			})
		]
	});
}
//#endregion
//#region src/board/ActorGraph.tsx
var Bn = 2400, Vn = () => `-${Math.round(performance.now() % Bn)}ms`;
function Hn(e) {
	let [t] = o(Vn);
	return e ? void 0 : { animationDelay: t };
}
function Un({ w: e, h: t, reducedMotion: n }) {
	let r = Hn(n);
	return /* @__PURE__ */ p("rect", {
		className: "kt-node-halo",
		x: -e / 2 - 8,
		y: -t / 2 - 8,
		width: e + 16,
		height: t + 16,
		rx: 23,
		style: r
	});
}
function Wn(e) {
	let t = e.brain.cited.length;
	return 2 + Math.min(4, t) + +!!e.brain.stale.length;
}
function Gn({ board: e, lay: n, focus: s, onActor: c, flashes: l, reducedMotion: u, feed: d, quiet: f = !1, onSession: h, onAct: g }) {
	let [_, v] = o(null), y = a(null), b = t((e, t) => {
		y.current && clearTimeout(y.current), y.current = setTimeout(() => v(e), t);
	}, []);
	r(() => () => void (y.current && clearTimeout(y.current)), []);
	let x = i(() => new Ft({
		now: () => performance.now(),
		reducedMotion: u
	}), [u]), S = a(null), C = kn(n, e.belt), w = It(n), T = It(C), E = i(() => new Map(e.actors.map((e) => [e.key, e])), [e.actors]), D = t((e) => {
		S.current?.dispose(), S.current = e && !u ? new Ln(e, x, {
			path: (e, t) => On(w.current, e, t, T.current),
			box: (e) => wn(w.current, e, T.current),
			now: () => performance.now()
		}) : null;
	}, [
		x,
		u,
		w,
		T
	]);
	r(() => (d.current = (e) => {
		x.ingest(e, performance.now()), S.current?.wake();
	}, () => {
		d.current = null;
	}), [x, d]), r(() => {
		let e = () => {
			x.setHidden(document.hidden, performance.now()), document.hidden || S.current?.wake();
		};
		return document.addEventListener("visibilitychange", e), () => document.removeEventListener("visibilitychange", e);
	}, [x]), r(() => () => S.current?.dispose(), []);
	let O = e.actors.filter((e) => gt.has(e.status)).length, k = e.actors.filter((e) => e.status === "awaiting_approval").length, A = e.actors.filter((e) => e.status === "merged").length, j = `需求的路：${e.actors.length} 个环节，${O} 个在做，${k} 个等人，${A} 个完成；检查 ${e.checks.passed}/${e.checks.total}。点一个环节只看它。`;
	return /* @__PURE__ */ m("div", {
		className: "kt-graph is-phased br-graph",
		"data-testid": "kt-graph",
		children: [/* @__PURE__ */ m("div", {
			className: "kt-graph-stage",
			children: [/* @__PURE__ */ m("svg", {
				className: "kt-graph-svg",
				viewBox: `0 0 ${n.width} ${n.height}`,
				role: "group",
				"aria-label": j,
				children: [
					/* @__PURE__ */ p(qn, {}),
					/* @__PURE__ */ p("rect", {
						className: "kt-g-bg",
						x: 0,
						y: 0,
						width: n.width,
						height: n.height,
						fill: "url(#kt-dots)"
					}),
					/* @__PURE__ */ p(Jn, {
						board: e,
						lay: n,
						byKey: E,
						reducedMotion: u
					}),
					/* @__PURE__ */ p(Zn, {
						board: e,
						lay: n
					}),
					/* @__PURE__ */ p(Xn, {
						board: e,
						lay: n,
						flash: l.orch,
						reducedMotion: u
					}),
					/* @__PURE__ */ p(Qn, {
						board: e,
						lay: n
					}),
					/* @__PURE__ */ p("g", {
						className: "kt-edges",
						"aria-hidden": "true",
						children: n.edges.map((e) => {
							let t = Kn(E.get(e.from), E.get(e.to)), n = !!s && (e.from === s || e.to === s);
							return /* @__PURE__ */ p("path", {
								className: `kt-edge is-${t}${s ? n ? " is-hot" : " is-dim" : ""}`,
								d: e.d,
								markerEnd: `url(#kt-arrow-${t})`
							}, `${e.from}>${e.to}`);
						})
					}),
					/* @__PURE__ */ p($n, {
						board: e,
						lay: n,
						head: C,
						focus: s,
						flash: l.run
					}),
					/* @__PURE__ */ p(er, {
						board: e,
						lay: n,
						flash: l.tests
					}),
					/* @__PURE__ */ m("g", {
						className: "kt-nodes",
						children: [e.actors.map((e) => {
							let t = n.nodes.get(e.key);
							return t ? /* @__PURE__ */ p(tr, {
								a: e,
								box: t,
								focus: s,
								flash: l[e.key],
								onActor: c,
								reducedMotion: u,
								quiet: f,
								onHover: (t) => b(t ? e.key : null, t ? 300 : 250)
							}, e.key) : null;
						}), !f && e.actors.filter((e) => e.status === "awaiting_approval" && n.nodes.get(e.key)).map((e) => /* @__PURE__ */ p(ir, {
							a: e,
							box: n.nodes.get(e.key),
							onAct: g
						}, `wait-${e.key}`))]
					}),
					/* @__PURE__ */ p("g", {
						className: "kt-particles",
						"aria-hidden": "true",
						ref: D
					})
				]
			}), _ && E.get(_) && n.nodes.get(_) && (() => {
				let e = n.nodes.get(_), t = e.x > n.width * .62, r = {
					...e.y > n.height * .55 ? { bottom: `${Math.max(1, (n.height - (e.y + 40)) / n.height * 100)}%` } : { top: `${Math.max(1, (e.y - 40) / n.height * 100)}%` },
					...t ? { right: `${(n.width - (e.x - 92 - 10)) / n.width * 100}%` } : { left: `${(e.x + 92 + 10) / n.width * 100}%` }
				};
				return /* @__PURE__ */ p("div", {
					className: "kt-ncard",
					style: r,
					"data-testid": "kt-ncard",
					role: "dialog",
					"aria-label": `${E.get(_).title}做了什么`,
					onMouseEnter: () => b(_, 0),
					onMouseLeave: () => b(null, 200),
					children: /* @__PURE__ */ p(zn, {
						a: E.get(_),
						onSession: f ? void 0 : h
					})
				}, _);
			})()]
		}), /* @__PURE__ */ p(or, {})]
	});
}
function Kn(e, t) {
	return !e || !t || e.status !== "merged" && e.status !== "done" ? "pending" : t.status !== "waiting" && t.status !== "skipped" ? "used" : "ready";
}
function qn() {
	return /* @__PURE__ */ m("defs", { children: [
		/* @__PURE__ */ p("pattern", {
			id: "kt-dots",
			width: 22,
			height: 22,
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ p("circle", {
				className: "kt-g-dot",
				cx: 2,
				cy: 2,
				r: 1
			})
		}),
		/* @__PURE__ */ p("pattern", {
			id: "kt-hatch",
			width: 9,
			height: 9,
			patternUnits: "userSpaceOnUse",
			patternTransform: "rotate(45)",
			children: /* @__PURE__ */ p("rect", {
				className: "kt-hatch-line",
				x: 0,
				y: 0,
				width: 3.5,
				height: 9
			})
		}),
		[
			"pending",
			"ready",
			"used"
		].map((e) => /* @__PURE__ */ p("marker", {
			id: `kt-arrow-${e}`,
			viewBox: "0 0 10 10",
			refX: 8.5,
			refY: 5,
			markerWidth: 7,
			markerHeight: 7,
			orient: "auto-start-reverse",
			children: /* @__PURE__ */ p("path", {
				className: `kt-arrow is-${e}`,
				d: "M0,0.8 L9,5 L0,9.2 Z"
			})
		}, e))
	] });
}
function Jn({ board: e, lay: t, byKey: n, reducedMotion: r }) {
	return /* @__PURE__ */ p("g", {
		className: "kt-phases",
		"aria-hidden": "true",
		children: t.phases.map((i) => {
			let a = (i.key === "init" ? [] : t.stages.filter((e) => e.phase === i.key).flatMap((e) => e.keys)).map((e) => n.get(e)).filter((e) => !!e), o = a.some((e) => _t.has(e.status)), s = a.filter((e) => gt.has(e.status)).length, c = a.length > 0 && a.every((e) => e.status === "skipped"), l = a.length > 0 && !c && a.every((e) => ht(e.status)), u = (i.x1 + i.x2) / 2, d = i.key === "init";
			return /* @__PURE__ */ m("g", {
				className: `kt-phase${c ? " is-unused" : ""}${o || d && e.person.status === "awaiting_approval" ? " is-live" : ""}${l ? " is-done" : ""}`,
				"data-phase": i.key,
				children: [
					/* @__PURE__ */ p("rect", {
						className: "kt-phase-band",
						x: i.x1,
						y: 8,
						width: i.x2 - i.x1,
						height: t.rail.y - 34,
						rx: 18
					}),
					/* @__PURE__ */ m("text", {
						className: "kt-phase-title",
						x: u,
						y: 30,
						textAnchor: "middle",
						children: [
							i.n,
							" ",
							i.title,
							i.x2 - i.x1 > 230 && /* @__PURE__ */ p("tspan", {
								className: "kt-phase-en",
								dx: 6,
								children: i.en
							})
						]
					}),
					/* @__PURE__ */ p("text", {
						className: "kt-phase-stages",
						x: u,
						y: 48,
						textAnchor: "middle",
						children: Et(i.sub, Math.max(6, (i.x2 - i.x1) / 13))
					}),
					c && /* @__PURE__ */ p("text", {
						className: "kt-phase-note",
						x: u,
						y: t.rail.y / 2 + 10,
						textAnchor: "middle",
						children: "这次不需要"
					}),
					s >= 2 && /* @__PURE__ */ m("g", {
						className: "kt-par",
						transform: `translate(${u},78)`,
						children: [
							/* @__PURE__ */ p("rect", {
								x: -52,
								y: -12,
								width: 104,
								height: 24,
								rx: 12
							}),
							/* @__PURE__ */ p(Yn, { reducedMotion: r }),
							/* @__PURE__ */ m("text", {
								x: 6,
								y: 4.5,
								textAnchor: "middle",
								children: ["同时在做 ", s]
							})
						]
					})
				]
			}, i.key);
		})
	});
}
function Yn({ reducedMotion: e }) {
	let t = Hn(e);
	return /* @__PURE__ */ p("circle", {
		className: "kt-par-dot",
		cx: -38,
		cy: 0,
		r: 4,
		style: t
	});
}
function Xn({ board: e, lay: t, flash: n, reducedMotion: r }) {
	let { w: i, h: a } = tn, o = e.person, s = o.status === "awaiting_approval";
	return /* @__PURE__ */ m("g", {
		className: `kt-orch br-person is-${o.status}${s ? " is-active" : ""}`,
		transform: `translate(${t.orch.x},${t.orch.y})`,
		"data-testid": "kt-orch",
		children: [
			/* @__PURE__ */ p("title", { children: `负责人 ${o.owner ?? ""}：${o.doing}` }),
			s && /* @__PURE__ */ p(Un, {
				w: i,
				h: a,
				reducedMotion: r
			}),
			/* @__PURE__ */ p("rect", {
				className: "kt-orch-body",
				x: -i / 2,
				y: -a / 2,
				width: i,
				height: a,
				rx: 18
			}),
			/* @__PURE__ */ p(se, {
				role: "person",
				cx: -i / 2 + 22,
				cy: -12,
				size: 20,
				className: "kt-node-emoji"
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-orch-title",
				x: -i / 2 + 38,
				y: -6,
				children: o.me ? "你" : "负责人"
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-orch-cn",
				x: -i / 2 + 38,
				y: 13,
				style: { fontSize: 12 },
				children: Et(o.owner ?? "—", 7)
			}),
			/* @__PURE__ */ p("text", {
				className: `kt-orch-sub${s ? " is-wait" : ""}`,
				y: 30,
				textAnchor: "middle",
				children: Et(s ? `✋ ${o.doing}` : o.doing, 10.5)
			}),
			n && /* @__PURE__ */ p("rect", {
				className: `kt-node-flash is-${n.tone}`,
				x: -i / 2 - 5,
				y: -a / 2 - 5,
				width: i + 10,
				height: a + 10,
				rx: 22
			}, n.n)
		]
	});
}
function Zn({ board: e, lay: t }) {
	return /* @__PURE__ */ p("g", {
		className: "kt-cmds",
		"aria-hidden": "true",
		children: e.actors.filter((e) => e.status === "awaiting_approval").map((e) => {
			let n = En(t, e.key);
			return n ? /* @__PURE__ */ p("path", {
				className: "kt-cmd is-awaiting_approval",
				d: mn(n)
			}, e.key) : null;
		})
	});
}
function Qn({ board: e, lay: t }) {
	let n = t.orch.y + tn.h / 2 + nn.top, r = tn.w + 12, i = e.brain, a = [
		{
			text: i.loaded === null ? "载入 —" : `载入 ${i.loaded} 条`,
			cls: i.loaded ? "is-team is-used" : "is-team",
			tip: "开工时从 Brain 带进来的条目"
		},
		{
			text: `引用 ${i.cited.length} 条`,
			cls: i.cited.length ? "is-team is-used" : "is-team",
			tip: "决定里引用的 Brain 条目"
		},
		...i.cited.slice(0, 4).map((e) => ({
			text: e,
			cls: "is-team is-used",
			tip: `引用了 ${e}`
		})),
		...i.stale.length ? [{
			text: `过时 ${i.stale.length} 条`,
			cls: "is-team is-busy",
			tip: `引用了过时的 ${i.stale.join("、")}`
		}] : []
	], o = nn.title;
	return /* @__PURE__ */ m("g", {
		className: "kt-roster",
		transform: `translate(${t.orch.x},${n})`,
		"data-testid": "kt-roster",
		children: [/* @__PURE__ */ p("text", {
			className: "kt-roster-title",
			y: 0,
			textAnchor: "middle",
			children: "Brain 带来的知识"
		}), a.map((e, t) => {
			let n = o;
			return o += nn.row, /* @__PURE__ */ m("g", {
				className: `kt-roster-item ${e.cls}`,
				transform: `translate(0,${n})`,
				children: [
					/* @__PURE__ */ p("title", { children: e.tip }),
					/* @__PURE__ */ p("rect", {
						x: -r / 2 + 8,
						y: -7.5,
						width: r - 8,
						height: 15,
						rx: 7.5
					}),
					/* @__PURE__ */ p("circle", {
						cx: -r / 2 + 18,
						cy: .5,
						r: 3.5
					}),
					/* @__PURE__ */ p("text", {
						x: -r / 2 + 28,
						y: 4.5,
						children: Et(e.text, 10)
					})
				]
			}, t);
		})]
	});
}
function $n({ board: e, lay: t, head: n, focus: r, flash: i }) {
	let { x1: a, x2: o, y: s } = t.rail, c = /* @__PURE__ */ new Map();
	for (let t of e.belt) {
		if (t.kind === "merge") continue;
		let e = c.get(t.actor);
		c.set(t.actor, {
			n: (e?.n ?? 0) + 1,
			last: t.sha.slice(0, 8),
			bot: t.by === "bot"
		});
	}
	let l = e.ended_at !== null || e.belt.some((e) => e.kind === "merge"), u = e.belt.length > 0;
	return /* @__PURE__ */ m("g", {
		className: "kt-rail",
		"data-testid": "kt-rail",
		children: [
			/* @__PURE__ */ p("line", {
				className: "kt-rail-base",
				x1: a,
				y1: s,
				x2: o,
				y2: s
			}),
			u && /* @__PURE__ */ p("line", {
				className: "kt-rail-fill",
				x1: a,
				y1: s,
				x2: l ? o : n,
				y2: s
			}),
			/* @__PURE__ */ m("text", {
				className: "kt-rail-label",
				x: a,
				y: s - 18,
				children: ["运行分支 ", /* @__PURE__ */ p("tspan", {
					className: "kt-mono",
					children: e.branch ?? "（还没开工）"
				})]
			}),
			/* @__PURE__ */ m("text", {
				className: "kt-rail-sub",
				x: a,
				y: s + 24,
				children: [
					"从 ",
					/* @__PURE__ */ p("tspan", {
						className: "kt-mono",
						children: e.base
					}),
					" 出发",
					l ? /* @__PURE__ */ m(f, { children: ["，已合并回 ", /* @__PURE__ */ p("tspan", {
						className: "kt-mono",
						children: e.base
					})] }) : ""
				]
			}),
			[...c.entries()].map(([n, i]) => {
				let a = t.mergeX.get(n), o = e.actors.find((e) => e.key === n);
				return a === void 0 || !o ? null : /* @__PURE__ */ m("g", {
					className: `kt-rail-dot${n === "handover" ? " is-handover" : ""}${r && r !== n ? " is-dim" : ""}`,
					transform: `translate(${a},${s})`,
					children: [
						/* @__PURE__ */ p("title", { children: `${o.title}：${n === "handover" ? "交接提交" : `${i.n} 次提交`}，最后一次 ${i.last}` }),
						/* @__PURE__ */ p("circle", { r: 10 }),
						/* @__PURE__ */ p(se, {
							role: o.icon,
							cx: 0,
							cy: 0,
							size: 13
						}),
						i.n > 1 && /* @__PURE__ */ m("text", {
							className: "kt-rail-n",
							x: 12,
							y: -10,
							children: ["×", i.n]
						})
					]
				}, n);
			}),
			l && /* @__PURE__ */ m("g", {
				className: "kt-rail-dot is-merge",
				transform: `translate(${o - 16},${s})`,
				children: [
					/* @__PURE__ */ p("title", { children: `合并进 ${e.base}` }),
					/* @__PURE__ */ p("circle", { r: 11 }),
					/* @__PURE__ */ p(se, {
						role: "merge",
						cx: 0,
						cy: 0,
						size: 14
					})
				]
			}),
			i && /* @__PURE__ */ p("circle", {
				className: `kt-rail-flash is-${i.tone}`,
				cx: n,
				cy: s,
				r: 14
			}, i.n)
		]
	});
}
function er({ board: e, lay: t, flash: n }) {
	let r = t.station, { passed: i, failed: a, total: o } = e.checks, s = r.r - 5, c = 2 * Math.PI * s, l = o ? i / o * c : 0, u = o ? a / o * c : 0;
	return /* @__PURE__ */ m("g", {
		className: `kt-station is-${o ? a ? "fail" : i === o ? "pass" : "part" : "none"}`,
		transform: `translate(${r.x},${r.y})`,
		"data-testid": "kt-station",
		role: "img",
		"aria-label": o ? `检查 ${i}/${o}` : "还没有检查结果",
		children: [
			/* @__PURE__ */ p("circle", {
				className: "kt-station-bg",
				r: r.r
			}),
			/* @__PURE__ */ p("circle", {
				className: "kt-station-track",
				r: s
			}),
			l > 0 && /* @__PURE__ */ p("circle", {
				className: "kt-station-pass",
				r: s,
				strokeDasharray: `${l} ${c}`,
				transform: "rotate(-90)"
			}),
			u > 0 && /* @__PURE__ */ p("circle", {
				className: "kt-station-fail",
				r: s,
				strokeDasharray: `${u} ${c}`,
				strokeDashoffset: -l,
				transform: "rotate(-90)"
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-station-num",
				y: 1,
				textAnchor: "middle",
				dominantBaseline: "central",
				children: o ? `${i}/${o}` : "—"
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-station-label",
				y: -r.r - 9,
				textAnchor: "middle",
				children: "检查"
			}),
			n && /* @__PURE__ */ p("circle", {
				className: `kt-station-flash is-${n.tone}`,
				r: r.r + 3
			}, n.n)
		]
	});
}
function tr({ a: e, box: t, focus: n, flash: r, onActor: i, reducedMotion: a, quiet: o, onHover: s }) {
	let c = mt(e.status), l = gt.has(e.status), u = [];
	e.status === "awaiting_approval" && u.push({
		text: "等你",
		tone: "gate"
	}), e.status === "stalled" && u.push({
		text: "⚠ 卡住",
		tone: "warn"
	}), e.status === "queued" && u.push({
		text: "排队",
		tone: "queue"
	}), e.status === "fixing" && u.push({
		text: "返工",
		tone: "fix"
	}), e.line && u.push({
		text: "打一行",
		tone: "approve"
	});
	let d = n === e.key, f = `${e.title}（${e.sub}）：${c.label}，${e.doing}`, h = (t) => {
		(t.key === "Enter" || t.key === " ") && (t.preventDefault(), i(e.key));
	}, g = 84, _ = !o && l && e.session?.busy ? "agent 在做" : null;
	return /* @__PURE__ */ m("g", {
		className: `kt-node is-${nr(e.status)}${ht(e.status) && e.status === "merged" ? " is-final" : ""}${n ? d ? " is-focus" : " is-dim" : ""}`,
		transform: `translate(${t.x},${t.y})`,
		"data-role": e.key,
		"data-status": e.status,
		role: "button",
		tabIndex: 0,
		"aria-label": f,
		"aria-pressed": d,
		onClick: () => i(e.key),
		onKeyDown: h,
		onMouseEnter: () => s?.(!0),
		onMouseLeave: () => s?.(!1),
		children: [
			/* @__PURE__ */ p("title", { children: f }),
			(l || e.status === "awaiting_approval") && /* @__PURE__ */ p(Un, {
				w: 184,
				h: 80,
				reducedMotion: a
			}),
			/* @__PURE__ */ p("rect", {
				className: "kt-node-body",
				x: -92,
				y: -40,
				width: 184,
				height: 80,
				rx: 16
			}),
			e.status === "stalled" && /* @__PURE__ */ p("rect", {
				className: "kt-node-hatch",
				x: -92,
				y: -40,
				width: 184,
				height: 80,
				rx: 16,
				fill: "url(#kt-hatch)"
			}),
			e.status === "queued" && /* @__PURE__ */ p("rect", {
				className: "kt-node-ants",
				x: -96,
				y: -44,
				width: 192,
				height: 88,
				rx: 19
			}),
			/* @__PURE__ */ p("circle", {
				className: "kt-node-avatar",
				cx: -59,
				cy: 0,
				r: 22.5
			}),
			l && /* @__PURE__ */ p("circle", {
				className: "kt-node-spin",
				cx: -59,
				cy: 0,
				r: 27
			}),
			/* @__PURE__ */ p(se, {
				role: e.icon,
				cx: -59,
				cy: 0,
				size: 24,
				className: "kt-node-emoji"
			}),
			/* @__PURE__ */ p("text", {
				className: `kt-node-title${e.title.length >= 5 ? " is-long" : ""}`,
				x: -26,
				y: -15,
				children: Et(e.title, 6.4)
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-node-task",
				x: -26,
				y: 4,
				children: Et(e.sub, 9.6)
			}),
			/* @__PURE__ */ p("text", {
				className: "kt-node-sub",
				x: -26,
				y: 23,
				children: rr(e)
			}),
			e.status === "merged" && /* @__PURE__ */ m("g", {
				className: "kt-node-check",
				transform: "translate(78,26)",
				children: [/* @__PURE__ */ p("circle", { r: 9 }), /* @__PURE__ */ p("path", { d: "M-4,0 L-1.2,3 L4.2,-3.2" })]
			}),
			e.status === "failed" && /* @__PURE__ */ m("g", {
				className: "kt-node-x",
				transform: "translate(78,26)",
				children: [/* @__PURE__ */ p("circle", { r: 9 }), /* @__PURE__ */ p("path", { d: "M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" })]
			}),
			u.slice(0, 2).map((e) => {
				let t = Math.max(34, e.text.length * 11 + 10);
				g -= t;
				let n = g;
				return g -= 4, /* @__PURE__ */ m("g", {
					className: `kt-node-badge is-${e.tone}`,
					transform: `translate(${n + t / 2},-40)`,
					children: [/* @__PURE__ */ p("rect", {
						x: -t / 2,
						y: -10,
						width: t,
						height: 20,
						rx: 10
					}), /* @__PURE__ */ p("text", {
						y: 4.5,
						textAnchor: "middle",
						children: e.text
					})]
				}, e.text);
			}),
			_ && /* @__PURE__ */ m("text", {
				className: "kt-node-ticker",
				x: 0,
				y: 58,
				textAnchor: "middle",
				children: [
					"▸ ",
					_,
					e.credits === null ? "" : ` · ${St(e.credits)} credits`
				]
			}),
			r && /* @__PURE__ */ p("rect", {
				className: `kt-node-flash is-${r.tone}`,
				x: -97,
				y: -45,
				width: 194,
				height: 90,
				rx: 20
			}, r.n),
			/* @__PURE__ */ p("rect", {
				className: "kt-node-focus",
				x: -97,
				y: -45,
				width: 194,
				height: 90,
				rx: 20
			})
		]
	});
}
var nr = (e) => e;
function rr(e) {
	let t = mt(e.status);
	return e.status === "awaiting_approval" ? Et(`✋ ${e.doing}`, 8.6) : e.status === "failed" ? Et(`✕ ${e.doing}`, 8.6) : (e.status, Et(e.doing || t.label, 8.6));
}
function ir({ a: e, box: t, onAct: n }) {
	let r = e.line ? "✋ 去打那一行" : e.key === "release" ? "✋ 去验收" : e.key === "reflect" ? "✋ 去回写" : e.doing.includes("接手被拒") ? "✋ 去改再交接" : e.doing.includes("工具调用") ? "✋ 去会话批准" : "✋ 去回答", i = () => n?.(e.key);
	return /* @__PURE__ */ m("g", {
		className: `kt-gate-chip${n ? "" : " is-static"}`,
		transform: `translate(${t.x},${t.y + 40 + 22})`,
		role: n ? "button" : void 0,
		tabIndex: n ? 0 : void 0,
		"aria-label": `${e.title}：${r.slice(2)}`,
		onClick: i,
		onKeyDown: (e) => {
			(e.key === "Enter" || e.key === " ") && (e.preventDefault(), i());
		},
		"data-testid": "kt-wait-chip",
		children: [/* @__PURE__ */ p("rect", {
			x: -54,
			y: -13,
			width: 108,
			height: 26,
			rx: 13
		}), /* @__PURE__ */ p("text", {
			y: 5,
			textAnchor: "middle",
			children: r
		})]
	});
}
var ar = [
	{
		status: "running",
		text: "在做"
	},
	{
		status: "fixing",
		text: "返工"
	},
	{
		status: "queued",
		text: "排队"
	},
	{
		status: "stalled",
		text: "卡住"
	},
	{
		status: "awaiting_approval",
		text: "等你"
	},
	{
		status: "done",
		text: "做完这步"
	},
	{
		status: "merged",
		text: "完成"
	},
	{
		status: "failed",
		text: "被拒 / 没过"
	},
	{
		status: "waiting",
		text: "还没轮到"
	},
	{
		status: "skipped",
		text: "这次不需要"
	}
];
function or() {
	return /* @__PURE__ */ m("div", {
		className: "kt-legend",
		role: "note",
		"aria-label": "图例",
		children: [
			ar.map((e) => /* @__PURE__ */ m("span", {
				className: `kt-legend-item is-${e.status}`,
				children: [/* @__PURE__ */ p("i", { "aria-hidden": "true" }), e.text]
			}, e.status)),
			/* @__PURE__ */ p("span", {
				className: "kt-legend-sep",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ m("span", {
				className: "kt-legend-item is-p-handoff",
				children: [/* @__PURE__ */ p("b", { "aria-hidden": "true" }), "交接 · 签名"]
			}),
			/* @__PURE__ */ m("span", {
				className: "kt-legend-item is-p-merge",
				children: [/* @__PURE__ */ p("b", { "aria-hidden": "true" }), "批准 · 回答"]
			}),
			/* @__PURE__ */ m("span", {
				className: "kt-legend-item is-p-pass",
				children: [/* @__PURE__ */ p("b", { "aria-hidden": "true" }), "检查全过"]
			}),
			/* @__PURE__ */ m("span", {
				className: "kt-legend-item is-p-fail",
				children: [/* @__PURE__ */ p("b", { "aria-hidden": "true" }), "退回 / 拦下 / 没过"]
			})
		]
	});
}
//#endregion
//#region src/board/CheckWall.tsx
function sr({ board: e, focus: t, onActor: n, flips: r }) {
	let [i, a] = o(null), s = e.checks, c = s.cells.find((e) => e.id === i) ?? null, l = s.cells.filter((e) => e.status === "fail"), u = s.cells.filter((e) => e.status === "wait"), d = s.total > 0 && s.failed === 0 && u.length === 0, h = (t) => e.actors.find((e) => e.key === t.actor)?.icon;
	return /* @__PURE__ */ m("section", {
		className: `kt-card kt-wall${d ? " is-green" : ""}`,
		"data-testid": "kt-wall",
		"aria-label": "检查墙",
		children: [
			/* @__PURE__ */ m("header", {
				className: "kt-card-head",
				children: [
					/* @__PURE__ */ p("h2", { children: "检查墙" }),
					/* @__PURE__ */ m("span", {
						className: `kt-wall-score${d ? " tone-ok" : l.length ? " tone-bad" : ""}`,
						children: [
							s.passed,
							"/",
							s.total
						]
					}),
					/* @__PURE__ */ p("span", {
						className: "kt-wall-src",
						children: "Lean 审批 · verify · 交接 · Brain"
					}),
					/* @__PURE__ */ p(cr, { at: s.at })
				]
			}),
			s.history.length > 0 && /* @__PURE__ */ m("div", {
				className: "kt-spark-row",
				children: [/* @__PURE__ */ p("span", {
					title: "每次 lean verify 记一个点",
					children: "verify 通过数"
				}), /* @__PURE__ */ p(lr, { history: s.history })]
			}),
			s.cells.length === 0 ? /* @__PURE__ */ p("p", {
				className: "kt-dim kt-wall-empty",
				children: "还没有检查：开工以后，Lean 的审批和 verify 都会记在这里"
			}) : /* @__PURE__ */ p("div", {
				className: "kt-wall-grid",
				children: Ot.map((e) => {
					let i = s.cells.filter((t) => t.group === e.key);
					return i.length ? /* @__PURE__ */ m("div", {
						className: "kt-ac is-multi br-wall-group",
						role: "group",
						"aria-label": e.label,
						children: [/* @__PURE__ */ p("div", {
							className: "kt-group-label",
							children: e.label
						}), /* @__PURE__ */ p("div", {
							className: "kt-ac-cells",
							children: i.map((e) => {
								let i = r[e.id] ?? 0, o = kt[e.status] ?? {
									label: e.status,
									glyph: "?"
								};
								return /* @__PURE__ */ p("button", {
									type: "button",
									className: `kt-cell is-${e.status}${t ? e.actor === t ? " is-hot" : " is-dim" : ""}`,
									"data-testid": "kt-cell",
									"data-case": e.id,
									"data-status": e.status,
									"aria-label": `${e.name}：${o.label}，${e.detail}`,
									onMouseEnter: () => a(e.id),
									onMouseLeave: () => a((t) => t === e.id ? null : t),
									onFocus: () => a(e.id),
									onBlur: () => a((t) => t === e.id ? null : t),
									onClick: () => e.actor && n(e.actor),
									children: /* @__PURE__ */ m("span", {
										className: `kt-cell-face${i ? " is-flip" : ""}`,
										children: [
											/* @__PURE__ */ p("span", {
												className: "kt-cell-ac",
												children: e.label
											}),
											/* @__PURE__ */ p("span", {
												className: "kt-cell-glyph",
												"aria-hidden": "true",
												children: o.glyph
											}),
											h(e) && /* @__PURE__ */ p("span", {
												className: "kt-cell-owner",
												"aria-hidden": "true",
												children: /* @__PURE__ */ p(V, {
													role: h(e),
													size: 12
												})
											})
										]
									}, i)
								}, e.id);
							})
						})]
					}, e.key) : null;
				})
			}),
			s.cells.length > 0 && /* @__PURE__ */ p("div", {
				className: `kt-wall-inspect${c ? ` is-${c.status}` : l.length ? " is-fail" : ""}`,
				"data-testid": "kt-inspect",
				children: c ? /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("strong", { children: [
					kt[c.status]?.glyph,
					" ",
					c.name
				] }), /* @__PURE__ */ p("span", { children: c.detail })] }) : l.length ? /* @__PURE__ */ m("span", { children: [
					/* @__PURE__ */ m("strong", {
						className: "tone-bad",
						children: [l.length, " 个没过"]
					}),
					" ",
					l.map((e) => e.label).join("、"),
					/* @__PURE__ */ p("span", {
						className: "kt-dim",
						children: " · 悬停或聚焦格子看原因"
					})
				] }) : u.length ? /* @__PURE__ */ m("span", { children: [
					/* @__PURE__ */ m("strong", {
						className: "tone-approve",
						children: [u.length, " 个等人"]
					}),
					" ",
					u.map((e) => e.label).join("、"),
					/* @__PURE__ */ p("span", {
						className: "kt-dim",
						children: " · 悬停看要做什么"
					})
				] }) : d ? /* @__PURE__ */ p("strong", {
					className: "tone-ok",
					children: "全部通过 ✓"
				}) : /* @__PURE__ */ p("span", {
					className: "kt-dim",
					children: "别的还没到：悬停看每一格"
				})
			})
		]
	});
}
function cr({ at: e }) {
	let t = Kt();
	return /* @__PURE__ */ p("span", {
		className: "kt-dim kt-wall-at",
		children: e ? `${xt(t - e)}更新` : "还没有结果"
	});
}
function lr({ history: e }) {
	if (!e.length) return null;
	let t = e[0].at, n = e[e.length - 1].at, r = Math.max(1, ...e.map((e) => e.passed + e.failed)), i = (e) => n > t ? 5 + (e - t) / (n - t) * 290 : 150, a = (e) => 35 - e / r * 30, o = `M${i(e[0].at).toFixed(1)},${a(e[0].passed).toFixed(1)}`;
	for (let t = 1; t < e.length; t++) o += ` H${i(e[t].at).toFixed(1)} V${a(e[t].passed).toFixed(1)}`;
	let s = e[e.length - 1], c = `${o} V35 H${i(e[0].at).toFixed(1)} Z`;
	return /* @__PURE__ */ m("svg", {
		className: "kt-spark",
		viewBox: "0 0 300 40",
		role: "img",
		"aria-label": `verify 通过数：${e.map((e) => `${e.passed}/${e.passed + e.failed}`).join(" → ")}`,
		children: [
			/* @__PURE__ */ p("line", {
				className: "kt-spark-total",
				x1: 0,
				x2: 300,
				y1: a(r),
				y2: a(r)
			}),
			/* @__PURE__ */ p("path", {
				className: "kt-spark-area",
				d: c
			}),
			/* @__PURE__ */ p("path", {
				className: "kt-spark-line",
				d: o
			}),
			e.map((t, n) => /* @__PURE__ */ p("circle", {
				className: t.failed ? "kt-spark-pt is-fail" : "kt-spark-pt is-pass",
				cx: i(t.at),
				cy: a(t.passed),
				r: n === e.length - 1 ? 3.4 : 2.2,
				children: /* @__PURE__ */ p("title", { children: `${t.passed}/${t.passed + t.failed}` })
			}, n)),
			/* @__PURE__ */ p("text", {
				className: "kt-spark-label",
				x: Math.min(298, i(s.at)),
				y: Math.max(9, a(s.passed) - 6),
				textAnchor: "end",
				children: s.passed
			})
		]
	});
}
var ur = (e) => `${e.row.repo}/${e.row.key}`, dr = (e) => e.events.reduce((e, t) => Math.max(e, t.seq), 0), fr = (e) => `${e.kind}@${e.sha}@${e.at}`, pr = (e, t) => `${e}#${t}`;
function mr(e, t) {
	return e ? e === "person" ? Sn : e === "branch" ? "run" : e === "checks" ? xn : t.has(e) ? e : null : null;
}
var hr = {
	start: "开工",
	request: "请批准",
	approve: "批准",
	reject: "退回",
	handover: "交接",
	accepted: "接手",
	rejected: "拒绝",
	signed: "合同",
	question: "问你",
	answer: "回答",
	reflect: "回写"
};
function gr(e, t, n, r) {
	let i = {
		key: pr(t, e.seq),
		t: e.at,
		kind: e.kind
	}, a = mr(e.from, n), o = mr(e.to, n), s = (t, n, r, a, o = hr[e.kind] ?? null) => {
		if (t && n && t !== n) return {
			...i,
			from: t,
			to: n,
			tone: r,
			shape: "comet",
			prio: a,
			label: o
		};
		let s = n ?? t;
		return s ? {
			...i,
			from: s,
			to: s,
			tone: r,
			shape: r === "bounce" || r === "danger" || r === "fail" ? "cross" : r === "pass" || r === "ok" ? "check" : "ring",
			prio: a
		} : null;
	}, c = (e, t, n, r) => e ? {
		...i,
		from: e,
		to: e,
		tone: t,
		shape: n,
		prio: r
	} : null;
	switch (e.kind) {
		case "start":
		case "session": return s(a, o, "run", e.kind === "start" ? 2 : 1);
		case "stage": return c(a, "tool", "spark", 0);
		case "request": return s(a, o, "info", 3);
		case "approve": return s(a, o, "pass", 3);
		case "reject": return s(a, o, "bounce", 3);
		case "refused": return c(o ?? a, "danger", "cross", 3);
		case "blocked": return c(a, "danger", "cross", 2);
		case "commit": return s(a, o, a === "orch" ? "danger" : "run", a === "orch" ? 3 : 2, null);
		case "handover": return s(a, o, "handoff", 3);
		case "accepted": return s(a, o, "handoff", 3);
		case "rejected": return s(a, o, "bounce", 3);
		case "signed": return s(a, o, "handoff", 3);
		case "question": return s(a, o, "info", 3);
		case "answer": return s(a, o, a === "orch" ? "ok" : "handoff", 3);
		case "verify": {
			let t = !!r && r.total > 0 && r.passed === r.total;
			return {
				...i,
				from: "run",
				to: xn,
				tone: /没过/.test(e.text) ? "fail" : t || /通过/.test(e.text) ? "pass" : "fail",
				shape: "comet",
				prio: 3,
				label: r ? `${r.passed}/${r.total}` : null
			};
		}
		case "merge": return c("run", "merge", "check", 3);
		case "reflect": return s(a, o, "ok", 2);
		default: return c(a ?? o, "info", "ring", 1);
	}
}
function _r(e, t, n) {
	let r = pr(t, e.seq), i = mr(e.to, n) ?? mr(e.from, n);
	switch (e.kind) {
		case "reject":
		case "rejected":
		case "refused": return i ? [{
			key: r,
			target: i,
			tone: "bad",
			kind: e.kind
		}] : [];
		case "blocked": return mr(e.from, n) ? [{
			key: r,
			target: mr(e.from, n),
			tone: "bad",
			kind: e.kind
		}] : [];
		case "verify": return /没过/.test(e.text) ? [{
			key: r,
			target: xn,
			tone: "bad",
			kind: e.kind
		}] : [];
		default: return [];
	}
}
function vr(e) {
	return {
		req: e,
		first: !0,
		fresh: [],
		items: [],
		flashes: [],
		flips: [],
		belt: [],
		actors: [],
		announce: null
	};
}
function yr(e, t, n = {}) {
	let r = n.lateS ?? 30, i = n.max ?? 24, a = ur(t);
	if (!e || ur(e) !== a || n.resync) return vr(a);
	let o = dr(e);
	if (dr(t) < o) return vr(a);
	let s = new Set(t.actors.map((e) => e.key)), c = t.events.filter((e) => e.seq > o).sort((e, t) => e.seq - t.seq), l = [], u = [], d = t.checks.cells.filter((e) => e.group === "verify"), f = d.length ? {
		passed: d.filter((e) => e.status === "pass").length,
		total: d.length
	} : null;
	for (let e of c) {
		if (n.at !== void 0 && n.at - e.at > r) continue;
		let t = gr(e, a, s, e.kind === "verify" ? f : null);
		t && l.push(t), u.push(..._r(e, a, s));
	}
	if (e.ended_at === null && t.ended_at !== null) {
		for (let e of t.actors) e.status === "merged" && u.push({
			key: `${a}#merged`,
			target: e.key,
			tone: "ok",
			kind: "merge"
		});
		u.push({
			key: `${a}#merged-run`,
			target: "run",
			tone: "ok",
			kind: "merge"
		});
	}
	t.checks.total > 0 && t.checks.failed === 0 && (e.checks.failed > 0 || e.checks.passed !== t.checks.passed) && t.checks.passed === t.checks.total && u.push({
		key: `${a}#green@${t.checks.at ?? ""}`,
		target: xn,
		tone: "ok",
		kind: "verify"
	}), l.length > i && (l = l.slice().sort((e, t) => t.prio - e.prio || e.t - t.t).slice(0, i).sort((e, t) => e.t - t.t));
	let p = new Map(e.checks.cells.map((e) => [e.id, e.status])), m = t.checks.cells.filter((e) => p.has(e.id) && p.get(e.id) !== e.status).map((e) => ({
		id: e.id,
		from: p.get(e.id),
		to: e.status
	})), h = new Map(e.actors.map((e) => [e.key, e.status])), g = t.actors.filter((e) => h.has(e.key) && h.get(e.key) !== e.status).map((e) => ({
		key: e.key,
		from: h.get(e.key),
		to: e.status
	})), _ = new Set(e.belt.map(fr)), v = t.belt.map(fr).filter((e) => !_.has(e));
	return {
		req: a,
		first: !1,
		fresh: c,
		items: l,
		flashes: u,
		flips: m,
		belt: v,
		actors: g,
		announce: br(e, t, c)
	};
}
function br(e, t, n) {
	let r = [];
	e.row.state !== t.row.state && r.push(`需求${t.row.state_label}`), (e.checks.passed !== t.checks.passed || e.checks.total !== t.checks.total) && r.push(`检查 ${e.checks.passed}/${e.checks.total} → ${t.checks.passed}/${t.checks.total}`);
	let i = [...n].reverse().find((e) => [
		"reject",
		"rejected",
		"refused",
		"question",
		"request"
	].includes(e.kind));
	if (i && r.push(i.text), r.length < 2) {
		let e = [...n].reverse().find((e) => [
			"approve",
			"handover",
			"accepted",
			"merge",
			"answer"
		].includes(e.kind));
		e && r.push(e.text);
	}
	return r.length ? r.slice(0, 2).join("；") : null;
}
//#endregion
//#region src/board/Conveyor.tsx
function xr({ board: e, fresh: t, focus: n, onActor: i }) {
	let s = Kt(), c = a(null), [l, u] = o(!1);
	r(() => {
		let e = c.current;
		e && (e.scrollLeft = e.scrollWidth, u(e.scrollLeft > 4));
	}, [e.belt.length]);
	let d = new Map(e.actors.map((e) => [e.key, e])), h = e.belt.filter((e) => e.kind === "commit"), g = h.filter((e) => e.by === "bot").length, _ = e.belt.some((e) => e.kind === "merge"), v = e.events.filter((e) => e.kind === "commit" && e.from === "person").length;
	return /* @__PURE__ */ m("section", {
		className: "kt-card kt-conveyor",
		"data-testid": "kt-conveyor",
		"aria-label": "提交传送带",
		children: [/* @__PURE__ */ m("header", {
			className: "kt-card-head",
			children: [/* @__PURE__ */ p("h2", { children: "提交传送带" }), /* @__PURE__ */ m("span", {
				className: "kt-dim",
				children: [
					h.length,
					" 次提交",
					g ? ` · 运行机 ${g} 次` : "",
					e.belt.some((e) => e.kind === "handover") ? " · 交接 1 次" : "",
					_ ? " · 已合并" : "",
					v ? /* @__PURE__ */ m(f, { children: [" · ", /* @__PURE__ */ m("span", {
						className: "tone-warn",
						children: [
							"交接后有人推了 ",
							v,
							" 次"
						]
					})] }) : null
				]
			})]
		}), e.belt.length === 0 ? /* @__PURE__ */ p("p", {
			className: "kt-dim kt-wall-empty",
			children: e.source === "trace" ? "运行分支上还没有提交" : "读不到运行分支的提交（brain-kit 没有 trace 模块）"
		}) : /* @__PURE__ */ m("ol", {
			className: `kt-belt${l ? " has-older" : ""}`,
			ref: c,
			onScroll: (e) => u(e.currentTarget.scrollLeft > 4),
			children: [
				/* @__PURE__ */ m("li", {
					className: "kt-belt-end is-base",
					title: "运行分支从这里出发",
					children: ["从 ", /* @__PURE__ */ p("code", { children: e.base })]
				}),
				e.belt.map((r) => {
					let a = fr(r), o = d.get(r.actor), c = r.kind === "handover" ? " is-handover" : r.kind === "merge" ? " is-merge" : r.by === "bot" ? " is-bot" : "";
					return /* @__PURE__ */ m("li", {
						className: `kt-belt-chip${c}${t.has(a) ? " is-new" : ""}${n && n !== r.actor ? " is-dim" : ""}`,
						children: [
							/* @__PURE__ */ m("button", {
								type: "button",
								className: "kt-belt-role",
								onClick: () => i(r.actor),
								title: r.text,
								children: [
									/* @__PURE__ */ p(V, {
										role: r.kind === "merge" ? "merge" : r.kind === "handover" ? "handover" : o?.icon ?? "commit",
										size: 14
									}),
									" ",
									r.kind === "merge" ? `合并进 ${e.base}` : r.kind === "handover" ? "交接" : r.by === "bot" ? "运行机" : "本机"
								]
							}),
							/* @__PURE__ */ m("span", {
								className: "kt-belt-meta",
								children: [
									r.sha && /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p("code", { children: r.sha.slice(0, 8) }), " · "] }),
									r.files ? `${r.files} 个文件 · ` : "",
									xt(s - r.at)
								]
							}),
							r.kind === "commit" && /* @__PURE__ */ m("span", {
								className: "kt-belt-text",
								children: [r.text, r.records_only ? "（只改记录）" : ""]
							})
						]
					}, a);
				}),
				/* @__PURE__ */ p("li", {
					className: `kt-belt-end is-head${_ ? " is-merged" : ""}`,
					title: _ ? "已合并进默认分支" : "运行分支的最新提交",
					children: /* @__PURE__ */ p("code", { children: _ ? e.base : e.branch ?? "运行分支" })
				})
			]
		})]
	});
}
//#endregion
//#region src/board/EventFeed.tsx
function Sr({ board: e, focus: t, onActor: n, fresh: r }) {
	let i = Kt(), [a, s] = o(!0), c = new Map(e.actors.map((e) => [e.key, e])), l = e.events.slice().reverse().filter((e) => (a || !e.detail) && (!t || Dt(e, t))), u = t ? c.get(t) : void 0;
	return /* @__PURE__ */ m("section", {
		className: "kt-card kt-feed",
		"data-testid": "kt-feed",
		"aria-label": "事件",
		children: [/* @__PURE__ */ m("header", {
			className: "kt-card-head",
			children: [
				/* @__PURE__ */ p("h2", { children: "事件" }),
				/* @__PURE__ */ p("span", {
					className: "kt-dim",
					children: e.source === "trace" ? "来自 brain-kit trace" : "来自 Lean 的记录"
				}),
				u && /* @__PURE__ */ m("button", {
					type: "button",
					className: "kt-filter",
					onClick: () => n(u.key),
					"aria-label": `不再只看${u.title}`,
					children: [
						"只看 ",
						/* @__PURE__ */ p(V, {
							role: u.icon,
							size: 14
						}),
						" ",
						u.title,
						" ✕"
					]
				}),
				/* @__PURE__ */ m("label", {
					className: "kt-check",
					children: [/* @__PURE__ */ p("input", {
						type: "checkbox",
						checked: a,
						onChange: (e) => s(e.target.checked)
					}), "Lean 细节"]
				})
			]
		}), /* @__PURE__ */ m("ol", {
			className: "kt-feed-list",
			children: [l.length === 0 && /* @__PURE__ */ p("li", {
				className: "kt-dim kt-feed-empty",
				children: t ? "这一环还没有事件" : "还没有事件"
			}), l.map((e) => {
				let t = vt[e.kind] ?? {
					icon: "•",
					label: e.kind,
					tone: "idle"
				};
				return /* @__PURE__ */ m("li", {
					className: `kt-ev is-${e.kind} tone-${t.tone}${r.has(e.seq) ? " is-new" : ""}${e.detail ? " is-tool" : ""}`,
					"data-seq": e.seq,
					title: e.src ?? void 0,
					children: [
						/* @__PURE__ */ p("span", {
							className: "kt-ev-icon",
							"aria-hidden": "true",
							title: t.label,
							children: t.icon
						}),
						/* @__PURE__ */ p("span", {
							className: "kt-ev-text",
							children: e.text
						}),
						/* @__PURE__ */ p(Cr, {
							e,
							byKey: c,
							onActor: n
						}),
						/* @__PURE__ */ p("time", {
							className: "kt-ev-time",
							dateTime: (/* @__PURE__ */ new Date(e.at * 1e3)).toISOString(),
							title: X(e.at),
							children: xt(i - e.at)
						})
					]
				}, e.seq);
			})]
		})]
	});
}
function Cr({ e, byKey: t, onActor: n }) {
	let r = (e) => {
		if (!e) return null;
		let r = t.get(e);
		return r ? /* @__PURE__ */ p("button", {
			type: "button",
			className: "kt-ev-role",
			onClick: () => n(r.key),
			title: `只看${r.title}`,
			"aria-label": `只看${r.title}`,
			children: /* @__PURE__ */ p(V, {
				role: r.icon,
				size: 15
			})
		}, r.key) : yt[e] ? /* @__PURE__ */ p("span", {
			className: "kt-ev-place",
			children: yt[e]
		}, e) : null;
	};
	return e.from && e.to && e.from !== e.to ? /* @__PURE__ */ m("span", {
		className: "kt-ev-roles",
		children: [
			r(e.from),
			/* @__PURE__ */ p("span", {
				"aria-hidden": "true",
				children: "→"
			}),
			r(e.to)
		]
	}) : /* @__PURE__ */ p("span", {
		className: "kt-ev-roles",
		children: r(e.from ?? e.to)
	});
}
//#endregion
//#region src/board/extra.ts
var wr = "\n.br-board .kt-orch.br-person .kt-orch-title { font-size: 17px; }\n.br-board .kt-orch.br-person.is-awaiting_approval .kt-orch-body { fill: color-mix(in srgb, var(--kt-approve) 13%, var(--card)); stroke: var(--kt-approve); stroke-width: 3; }\n.br-board .kt-orch.br-person.is-awaiting_approval .kt-node-halo { stroke: var(--kt-approve); animation: kt-beacon 1.1s ease-in-out infinite; }\n.br-board .kt-orch.br-person.is-merged .kt-orch-body { fill: color-mix(in srgb, var(--kt-ok) 10%, var(--card)); stroke: var(--kt-ok); }\n.br-board .kt-orch.br-person.is-waiting .kt-orch-body { stroke: color-mix(in srgb, var(--muted) 55%, transparent); }\n.br-board .kt-orch-sub.is-wait { fill: var(--kt-approve); font-weight: 800; }\n.br-board .kt-node-x circle { fill: #fff; }\n.br-board .kt-node-x path { fill: none; stroke: var(--kt-bad-solid); stroke-width: 2.4; stroke-linecap: round; }\n.br-board .kt-node.is-done .kt-node-sub { fill: var(--kt-ok); }\n.br-board .kt-node.is-awaiting_approval .kt-node-task, .br-board .kt-node.is-failed .kt-node-task { fill: var(--text); }\n.br-board .kt-node.is-failed .kt-node-task { fill: #fff; fill-opacity: .85; }\n.br-board .kt-node.is-merged .kt-node-task { fill: #fff; fill-opacity: .8; }\n.br-board .kt-rail-dot.is-handover circle { fill: var(--kt-handoff); }\n.br-board .kt-rail-dot.is-merge circle { fill: var(--kt-ok-solid); stroke: var(--kt-ok); stroke-width: 2.5; }\n.br-board .kt-rail-dot .kt-role-icon { color: #fff; }\n.br-board .kt-rail-n { fill: var(--muted); font-size: 11px; font-weight: 800; }\n.br-board .kt-station.is-part .kt-station-bg { stroke: color-mix(in srgb, var(--kt-approve) 60%, transparent); }\n.br-board .kt-gate-chip text { fill: #fff; }\n\n/* the check wall: a cell that waits for a person is magenta, like everything that waits for one */\n.br-board .kt-cell.is-wait { --kt-c: var(--kt-approve); }\n.br-board .kt-cell.is-wait .kt-cell-face { border-style: solid; animation: kt-blink 2.4s ease-in-out infinite; }\n.br-board .kt-wall-inspect.is-wait { background: color-mix(in srgb, var(--kt-approve) 9%, transparent); }\n.br-board .br-wall-group .kt-ac-cells { flex-wrap: wrap; }\n.br-board .kt-cell-ac { overflow: hidden; text-overflow: ellipsis; max-width: 100%; }\n.kt-segs i.is-wait { background: var(--kt-approve); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-approve) 50%, transparent); }\n.kt-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }\n\n/* the lanes: work, waits for a person, work done again */\n.br-board .kt-track-span.is-wait { background: color-mix(in srgb, var(--kt-approve) 60%, transparent); }\n.br-board .kt-track-span.is-wait.is-live { background: var(--kt-approve); box-shadow: 0 0 10px color-mix(in srgb, var(--kt-approve) 70%, transparent); }\n.br-board .kt-track-span.is-fix { background: color-mix(in srgb, var(--kt-fix) 70%, transparent); }\n.br-board .kt-track-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: var(--kt-ok); }\n.br-board .kt-track-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: var(--kt-bad); }\n.br-board .kt-track-mark:is(.is-request, .is-question) { background: var(--kt-approve); }\n.br-board .kt-track-mark:is(.is-handover, .is-signed) { background: var(--kt-handoff); }\n.br-board .kt-track-mark.is-blocked { background: var(--kt-warn); }\n.br-board .kt-track-mark.is-commit { top: 4px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--text-strong); box-shadow: 0 0 0 2px var(--card); }\n.br-board .kt-track-mark.is-session { background: var(--kt-run); }\n.br-board .br-fact { color: var(--text); }\n.br-board .br-mark { padding: 0 6px; border-radius: 6px; font-family: var(--font-body, sans-serif); font-weight: 750; font-size: .95em;\n  background: color-mix(in srgb, var(--muted) 16%, transparent); color: var(--text-strong) !important; }\n.br-board .br-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: color-mix(in srgb, var(--kt-ok) 18%, transparent); }\n.br-board .br-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: color-mix(in srgb, var(--kt-bad) 18%, transparent); }\n.br-board .br-mark:is(.is-request, .is-question) { background: color-mix(in srgb, var(--kt-approve) 18%, transparent); }\n.br-board .br-mark:is(.is-handover, .is-signed) { background: color-mix(in srgb, var(--kt-handoff) 20%, transparent); }\n.br-board .kt-lane .br-line { margin-top: 2px; }\n\n/* the conveyor */\n.br-board .kt-belt-chip.is-handover { border: 1px solid color-mix(in srgb, var(--kt-handoff) 60%, var(--border)); background: color-mix(in srgb, var(--kt-handoff) 12%, var(--card)); }\n.br-board .kt-belt-chip.is-bot { border-color: color-mix(in srgb, var(--kt-run) 50%, var(--border)); background: color-mix(in srgb, var(--kt-run) 9%, var(--card)); }\n.br-board .kt-belt-chip.is-merge { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); }\n.br-board .kt-belt-chip.is-merge :is(.kt-belt-role, .kt-belt-meta, .kt-belt-meta code) { color: #fff; }\n.br-board .kt-belt-text { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8em; color: var(--text); }\n.br-board .kt-belt-end.is-head.is-merged { background: var(--kt-ok-solid); color: #fff; border-color: var(--kt-ok-solid); }\n.br-board .kt-belt-end.is-head.is-merged code { color: #fff; }\n\n/* the counters */\n.br-board .br-kpis { grid-template-columns: minmax(190px, 1fr) minmax(260px, 1.45fr) minmax(190px, 1fr) minmax(220px, 1.1fr) minmax(130px, .7fr); }\n@media (max-width: 1240px) { .br-board .br-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-board .kt-kpi.is-warn { border-color: var(--kit-wait); }\n.br-dots { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; min-height: 12px; }\n.br-dots i { width: 12px; height: 12px; border-radius: 4px; }\n.br-dots i.is-point { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 55%, transparent); }\n.br-dots i.is-out { background: var(--kt-warn); }\n.br-board .kt-gates-rows { margin-top: 4px; }\n\n/* the event feed's places (你, 运行分支, 检查) */\n.br-board .kt-ev-place { padding: 0 5px; border-radius: 7px; border: 1px dashed var(--border-strong, var(--border)); font-size: 12px; color: var(--muted); }\n\n/* 验收 */\n.br-board .kt-sign.is-idle { border-color: var(--border); }\n.br-board .kt-sign-head .kt-pill { align-self: center; }\n.br-board .kt-sign-grid dd { color: var(--text-strong); }\n.br-board .br-accept-desc dt { display: flex; align-items: center; gap: 8px; }\n.br-board .br-accept-desc dd > span { font-weight: 650; }\n.br-step { display: grid; gap: 8px; margin-top: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--kit-wait);\n  background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }\n.br-step p { margin: 0; }\n.br-step-who { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--kt-approve); font-size: .9em; }\n.br-extbtn { text-decoration: none; }\n.br-board .br-board-qs { display: grid; gap: 10px; }\n.br-board .kt-sign-blocked { font-size: .95em; }\n\n/* the introduction: five phases */\n.br-way.kt-team-intro.is-phased { grid-template-columns: .7fr 1.25fr 1.7fr 1.1fr .8fr; }\n@media (max-width: 1100px) { .br-way.kt-team-intro.is-phased { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-btn-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }\n";
//#endregion
//#region src/board/Header.tsx
function Tr({ board: e, replaying: t, follow: n, onReplay: r, onFollow: i, onDetail: a, onSession: o, onStart: s }) {
	let c = e.row, l = e.actors.find((e) => e.key === "local")?.session ?? null, u = e.actors.find((e) => e.key === "runner")?.session ?? null, d = e.ended_at !== null || c.state === "merged" || c.state === "closed";
	return /* @__PURE__ */ m("header", {
		className: "kt-top",
		children: [/* @__PURE__ */ m("div", {
			className: "kt-title",
			children: [
				a ? /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-run-title kt-run-link",
					onClick: a,
					title: "需求详情：周期、时间花在哪、成本、检查、决定和问题",
					children: c.title
				}) : /* @__PURE__ */ p("span", {
					className: "kt-run-title",
					children: c.title
				}),
				/* @__PURE__ */ p("span", {
					className: "kt-pill tone-info kt-mono",
					"data-testid": "br-board-key",
					children: c.key
				}),
				/* @__PURE__ */ p(U, {
					state: c.state,
					label: c.state_label
				}),
				e.live && !t && /* @__PURE__ */ m("span", {
					className: "kt-pill tone-run is-live",
					children: [/* @__PURE__ */ p("i", {
						"aria-hidden": "true",
						children: "●"
					}), "此刻有人在做"]
				}),
				/* @__PURE__ */ m("span", {
					className: "kt-run-meta kt-mono",
					title: c.worktree ?? void 0,
					children: [e.branch ? `${e.branch} ← ${e.base}` : `还没有运行分支（${e.base}）`, c.owner ? ` · ${c.owner}` : ""]
				})
			]
		}), /* @__PURE__ */ m("div", {
			className: "kt-actions",
			children: [
				r && !t && e.events.length > 1 && /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					onClick: r,
					title: d ? "按记录从头重放：谁在什么时候做了什么，哪里等人、哪里被退回" : "把到现在为止的经过重放一遍",
					children: "▶ 回放"
				}),
				!t && l && o && /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => o(l.url),
					title: "在 Kiro Crew 里打开本机的 brain-dev 会话",
					children: "本机会话"
				}),
				!t && u && o && /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => o(u.url),
					title: "打开运行机上的 brain-run 会话",
					children: "运行机会话"
				}),
				!t && s && c.state === "claimed" && /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: s,
					children: "去开工"
				}),
				/* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					"aria-pressed": n,
					onClick: i,
					title: "自动滚到正在动的那一环",
					children: "跟随"
				}),
				a && /* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn",
					onClick: a,
					children: "需求详情 ↗"
				})
			]
		})]
	});
}
function Er({ board: e, reducedMotion: t, onActor: n }) {
	return /* @__PURE__ */ m("div", {
		className: "kt-kpis br-kpis",
		role: "group",
		"aria-label": "指标",
		children: [
			/* @__PURE__ */ p(Dr, {
				board: e,
				reducedMotion: t
			}),
			/* @__PURE__ */ p(Or, { board: e }),
			/* @__PURE__ */ p(kr, { board: e }),
			/* @__PURE__ */ p(Ar, {
				board: e,
				onActor: n
			}),
			/* @__PURE__ */ p(jr, {
				board: e,
				reducedMotion: t
			})
		]
	});
}
function Dr({ board: e, reducedMotion: t }) {
	let n = e.checks, r = Math.round(qt(n.passed, 900, t)), i = Jt(n.passed), a = n.cells.filter((e) => e.status === "wait").length, o = n.total > 0 && n.failed === 0 && a === 0;
	return /* @__PURE__ */ m("div", {
		className: `kt-kpi kt-kpi-tests${o ? " is-green" : ""}`,
		children: [
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-label",
				children: "检查通过"
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-value",
				"data-testid": "br-checks-counter",
				"aria-label": `检查通过 ${n.passed}/${n.total}`,
				children: [/* @__PURE__ */ p("span", {
					className: `kt-kpi-big${i ? " is-pop" : ""}`,
					children: r
				}, i), /* @__PURE__ */ m("span", {
					className: "kt-kpi-of",
					children: ["/", n.total]
				})]
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-segs",
				"aria-hidden": "true",
				children: n.cells.filter((e) => e.status !== "skip").map((e) => /* @__PURE__ */ p("i", {
					className: e.status === "pass" ? "is-pass" : e.status === "fail" ? "is-fail" : "is-wait",
					title: e.name
				}, e.id))
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-note",
				children: n.total ? o ? /* @__PURE__ */ p("b", {
					className: "tone-ok",
					children: "全过"
				}) : n.failed ? /* @__PURE__ */ m("b", {
					className: "tone-bad",
					children: [n.failed, " 个没过"]
				}) : /* @__PURE__ */ m("b", {
					className: "tone-approve",
					children: [a, " 个等人"]
				}) : "还没有检查结果"
			})
		]
	});
}
function Or({ board: e }) {
	let t = e.row.lean, n = t.stage_state === "started" && t.stage_n !== null ? t.stage_n : null, r = e.events.filter((e) => e.kind === "approve").length, i = e.events.filter((e) => e.kind === "reject").length, a = e.events.filter((e) => e.kind === "blocked").length;
	return /* @__PURE__ */ m("div", {
		className: "kt-kpi kt-kpi-gates br-kpi-lean",
		children: [
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-label",
				children: ["AI-DLC Lean · ", t.stage_label ?? "还没开始"]
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-value",
				children: [/* @__PURE__ */ p("span", {
					className: "kt-kpi-big",
					children: t.done
				}), /* @__PURE__ */ m("span", {
					className: "kt-kpi-of",
					children: [
						"/",
						t.total,
						" 个阶段"
					]
				})]
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-segs",
				"aria-hidden": "true",
				children: Array.from({ length: t.total }, (e, r) => /* @__PURE__ */ p("i", { className: r < t.done ? "is-pass" : n !== null && r === n - 1 ? "is-run" : "" }, r))
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-gates-rows",
				children: [
					/* @__PURE__ */ m("span", {
						className: "",
						children: ["批准 ", /* @__PURE__ */ p("b", { children: r })]
					}),
					/* @__PURE__ */ m("span", {
						className: i ? "is-hit" : "",
						children: ["退回 ", /* @__PURE__ */ p("b", { children: i })]
					}),
					/* @__PURE__ */ m("span", {
						className: a ? "is-hit" : "",
						children: ["拦下 ", /* @__PURE__ */ p("b", { children: a })]
					})
				]
			})
		]
	});
}
function kr({ board: e }) {
	let t = e.events.filter((e) => (e.kind === "approve" || e.kind === "reject" || e.kind === "answer") && e.from === "person").length, n = e.events.filter((e) => e.kind === "commit" && e.from === "person").length, r = e.actors.find((e) => e.key === "handover")?.status;
	return /* @__PURE__ */ m("div", {
		className: `kt-kpi br-kpi-people${n ? " is-warn" : ""}`,
		children: [
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-label",
				children: "人介入"
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-value",
				children: [/* @__PURE__ */ p("span", {
					className: "kt-kpi-big",
					children: t + n
				}), /* @__PURE__ */ p("span", {
					className: "kt-kpi-of",
					children: "次"
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-dots",
				"aria-hidden": "true",
				children: [Array.from({ length: t }, (e, t) => /* @__PURE__ */ p("i", { className: "is-point" }, `a${t}`)), Array.from({ length: n }, (e, t) => /* @__PURE__ */ p("i", { className: "is-out" }, `o${t}`))]
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-note",
				children: [
					/* @__PURE__ */ m("b", {
						className: "tone-ok",
						children: ["判断点上 ", t]
					}),
					n ? /* @__PURE__ */ m(f, { children: [" · ", /* @__PURE__ */ m("b", {
						className: "tone-warn",
						children: ["判断点之外 ", n]
					})] }) : " · 判断点之外 0",
					r === "skipped" ? " · 只在本机" : ""
				]
			})
		]
	});
}
function Ar({ board: e, onActor: t }) {
	let n = e.actors.filter((e) => e.status !== "skipped"), r = n.filter((e) => e.status === "merged" || e.status === "done").length, i = n.filter((e) => gt.has(e.status)).length, a = n.filter((e) => e.status === "awaiting_approval").length;
	return /* @__PURE__ */ m("div", {
		className: "kt-kpi kt-kpi-roles",
		children: [
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-label",
				children: "这条路走到哪了"
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-value",
				"data-testid": "br-steps-counter",
				children: [/* @__PURE__ */ p("span", {
					className: "kt-kpi-big",
					children: r
				}), /* @__PURE__ */ m("span", {
					className: "kt-kpi-of",
					children: ["/", n.length]
				})]
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-role-dots",
				children: n.map((e) => {
					let n = mt(e.status);
					return /* @__PURE__ */ p("button", {
						type: "button",
						className: `kt-role-dot tone-${n.tone}${gt.has(e.status) ? " is-working" : ""}`,
						title: `${e.title}：${n.label}（点一下只看它）`,
						"aria-label": `${e.title}：${n.label}`,
						onClick: () => t?.(e.key),
						children: /* @__PURE__ */ p(V, {
							role: e.icon,
							size: 15
						})
					}, e.key);
				})
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-kpi-note",
				children: [i ? /* @__PURE__ */ m("b", {
					className: "tone-run",
					children: ["在做 ", i]
				}) : "没有在做的", a ? /* @__PURE__ */ m("b", {
					className: "tone-approve",
					children: [
						" · ",
						a,
						" 个等你"
					]
				}) : null]
			})
		]
	});
}
function jr({ board: e, reducedMotion: t }) {
	let n = e.credits.total, r = qt(n ?? 0, 900, t);
	return /* @__PURE__ */ m("div", {
		className: "kt-kpi kt-kpi-credits",
		children: [
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-label",
				children: "credits"
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-value",
				children: /* @__PURE__ */ p("span", {
					className: "kt-kpi-big",
					children: n === null ? "—" : St(r)
				})
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-kpi-note",
				children: n === null ? "这个 app 开的会话还没报" : `${e.sessions.length} 个会话合计`
			})
		]
	});
}
var Mr = [
	{
		phase: "0 认领",
		title: "一个需求号，文档过五关",
		steps: [[{
			icon: "person",
			title: "你",
			does: "认领、交文档、开工"
		}]]
	},
	{
		phase: "1 本机 · Lean",
		title: "brain-dev 会话带着 Lean 推进",
		steps: [[{
			icon: "laptop",
			title: "本机会话",
			does: "读需求、读 Brain、写文档"
		}], [{
			icon: "req",
			title: "需求审批",
			does: "你在会话里打一行"
		}, {
			icon: "design",
			title: "设计审批",
			does: "你在会话里打一行"
		}]]
	},
	{
		phase: "2 交给运行机",
		title: "桥核对，签名服务签合同",
		steps: [
			[{
				icon: "handover",
				title: "交接",
				does: "brain handoff"
			}],
			[{
				icon: "bridge",
				title: "桥",
				does: "核对、转问题"
			}, {
				icon: "signer",
				title: "签名",
				does: "接手合同"
			}],
			[{
				icon: "runner",
				title: "运行机",
				does: "无人值守地做"
			}]
		]
	},
	{
		phase: "3 检查 · 验收",
		title: "机器检查，产品验收",
		steps: [[{
			icon: "ci",
			title: "CI 检查",
			does: "lean verify"
		}, {
			icon: "release",
			title: "发布验收",
			does: "在 MR 上验收"
		}]]
	},
	{
		phase: "4 回写",
		title: "学到的写回 Brain",
		steps: [[{
			icon: "brain",
			title: "回写 Brain",
			does: "brain reflect"
		}]]
	}
];
function Nr({ board: e, onStart: t }) {
	return /* @__PURE__ */ m("section", {
		className: "kt-empty",
		"data-testid": "br-board-intro",
		"aria-label": "这个需求还没开工",
		children: [
			/* @__PURE__ */ m("div", {
				className: "kt-empty-hero",
				children: [
					/* @__PURE__ */ m("h2", { children: [e.row.key, " 认领了，还没开工"] }),
					/* @__PURE__ */ p("p", { children: "开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求和设计由你在会话里自己批准；交给运行机以后，桥核对交接，签名服务签合同，运行机无人值守地做，有问题停下来在 MR 上问人；检查过了，产品在 MR 上验收；合并以后，学到的东西写回 Brain。" }),
					/* @__PURE__ */ p("p", {
						className: "kt-empty-punch",
						children: "人只在判断点上出手：批准、回答、验收。"
					})
				]
			}),
			/* @__PURE__ */ p("ol", {
				className: "kt-team-intro is-phased br-way",
				"aria-label": "一个需求的路，从左到右",
				children: Mr.map((e) => /* @__PURE__ */ m("li", {
					className: "kt-intro-phase",
					children: [/* @__PURE__ */ m("div", {
						className: "kt-intro-phase-head",
						children: [/* @__PURE__ */ p("b", { children: e.phase }), /* @__PURE__ */ p("span", { children: e.title })]
					}), /* @__PURE__ */ p("div", {
						className: "kt-intro-phase-body",
						children: e.steps.map((e, t) => /* @__PURE__ */ p("div", {
							className: "kt-intro-stage",
							children: e.map((e) => /* @__PURE__ */ m("div", {
								className: "kt-intro-role",
								children: [
									/* @__PURE__ */ p(V, {
										role: e.icon,
										size: 26,
										className: "kt-intro-emoji"
									}),
									/* @__PURE__ */ p("span", {
										className: "kt-intro-name",
										children: /* @__PURE__ */ p("b", { children: e.title })
									}),
									/* @__PURE__ */ p("span", {
										className: "kt-intro-does",
										children: e.does
									})
								]
							}, e.title))
						}, t))
					})]
				}, e.phase))
			}),
			t && /* @__PURE__ */ m("div", {
				className: "br-hero-acts",
				children: [/* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn is-primary br-btn-big",
					onClick: t,
					children: "去开需求，开工"
				}), /* @__PURE__ */ m("span", {
					className: "kt-dim",
					children: ["认领于 ", X(e.started_at)]
				})]
			})
		]
	});
}
//#endregion
//#region src/board/Lanes.tsx
function Pr({ board: e, focus: t, bumps: n, onActor: r, quiet: i = !1 }) {
	let a = e.actors.filter((e) => e.status === "skipped");
	return /* @__PURE__ */ m("section", {
		className: "kt-lanes",
		"aria-label": "各环节的泳道",
		"data-testid": "kt-lanes",
		children: [
			/* @__PURE__ */ p(zr, { board: e }),
			e.actors.filter((e) => e.status !== "skipped").map((a) => /* @__PURE__ */ p(Hr, {
				a,
				board: e,
				focused: t === a.key,
				dim: !!t && t !== a.key,
				bump: n[a.key] ?? 0,
				onActor: r,
				quiet: i
			}, a.key)),
			a.length > 0 && /* @__PURE__ */ m("p", {
				className: "kt-dim kt-lanes-out",
				"data-testid": "kt-lanes-out",
				children: ["这次不需要：", Fr(a)]
			})
		]
	});
}
function Fr(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) t.set(n.doing, [...t.get(n.doing) ?? [], n.title]);
	return [...t].map(([e, t]) => `${t.join("、")}${e ? `（${e}）` : ""}`).join("；");
}
function Ir(e) {
	let t = [
		60,
		300,
		900,
		1800,
		3600,
		10800,
		21600,
		43200,
		86400,
		172800,
		604800
	].find((t) => e / t <= 6) ?? Math.ceil(e / 6 / 86400) * 86400, n = [];
	for (let r = 0; r <= e + 1e-6; r += t) n.push(r);
	return n;
}
function Lr(e) {
	if (e <= 0) return "0";
	if (e < 3600) return `${Math.round(e / 60)} 分`;
	if (e < 86400) return `${Math.round(e / 3600)} 小时`;
	let t = Math.floor(e / 86400), n = Math.round(e % 86400 / 3600);
	return n ? `${t} 天 ${n} 时` : `${t} 天`;
}
function Rr(e) {
	let t = Kt(), n = e.started_at ?? e.at, r = Math.max(n + 60, e.ended_at ?? t);
	return {
		t0: n,
		t1: r,
		pct: (e) => Math.min(100, Math.max(0, (e - n) / (r - n) * 100))
	};
}
function zr({ board: e }) {
	let { t0: t, t1: n } = Rr(e), r = n - t;
	return /* @__PURE__ */ m("div", {
		className: "kt-lane kt-lane-axis",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ m("div", {
			className: "kt-axis-title",
			children: [
				"时间线（从 ",
				X(t),
				" 开工起）"
			]
		}), /* @__PURE__ */ p("div", {
			className: "kt-axis",
			children: Ir(r).map((e) => /* @__PURE__ */ p("span", {
				className: "kt-axis-tick",
				style: { left: `${e / r * 100}%` },
				children: Lr(e)
			}, e))
		})]
	});
}
var Br = {
	commit: "提交",
	approved: "批准",
	rejected: "退回",
	request: "请求批准",
	refused: "口令没被接受",
	blocked: "Lean 拦下",
	handover: "交接",
	accepted: "桥接手",
	signed: "签名",
	question: "问人",
	answer: "回答",
	"verify-ok": "verify 通过",
	"verify-fail": "verify 没过",
	reflect: "回写",
	session: "会话"
};
function Vr({ a: e, board: t }) {
	let n = Kt(), { pct: r, t0: i } = Rr(t);
	return /* @__PURE__ */ m("div", {
		className: "kt-track",
		role: "img",
		"aria-label": `${e.title}的时间线：${e.spans.length ? e.spans.map((e) => `${e.kind === "wait" ? "等人" : e.kind === "fix" ? "返工" : "在做"} ${bt((e.b ?? n) - e.a)}`).join("，") : "还没开始"}`,
		children: [
			/* @__PURE__ */ p("div", { className: "kt-track-line" }),
			e.spans.map((e, t) => /* @__PURE__ */ p("span", {
				className: `kt-track-span is-${e.kind}${e.b === null ? " is-live" : ""}`,
				style: {
					left: `${r(e.a)}%`,
					width: `${Math.max(.6, r(e.b ?? n) - r(e.a))}%`
				},
				title: `${e.kind === "wait" ? "等人" : e.kind === "fix" ? "返工" : "在做"}：${X(e.a)} 起，${e.b === null ? "到现在" : `用了 ${bt(e.b - e.a)}`}（开工后 ${bt(e.a - i)}）`
			}, t)),
			e.marks.map((e, t) => /* @__PURE__ */ p("span", {
				className: `kt-track-mark is-${e.kind}`,
				style: { left: `${r(e.at)}%` },
				title: `${X(e.at)} · ${e.title}`
			}, `m${t}`))
		]
	});
}
function Hr({ a: e, board: t, focused: n, dim: r, bump: i, onActor: a, quiet: o }) {
	let s = mt(e.status), c = e.status === "waiting";
	return /* @__PURE__ */ m("article", {
		className: `kt-lane is-${e.status} tone-${s.tone}${n ? " is-focus" : ""}${r ? " is-dim" : ""}${c ? " is-compact" : ""}`,
		"data-testid": "kt-lane",
		"data-role": e.key,
		"data-status": e.status,
		"aria-label": `${e.title}：${s.label}`,
		children: [
			i > 0 && /* @__PURE__ */ p("span", {
				className: "kt-lane-bump",
				"aria-hidden": "true"
			}, i),
			/* @__PURE__ */ p(Ur, {
				a: e,
				focused: n,
				onActor: a,
				quiet: o
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-lane-live",
				children: /* @__PURE__ */ p(Gr, {
					a: e,
					quiet: o
				})
			}),
			/* @__PURE__ */ p("div", {
				className: "kt-lane-work",
				children: !c && /* @__PURE__ */ p(Kr, { a: e })
			}),
			/* @__PURE__ */ p(Vr, {
				a: e,
				board: t
			})
		]
	});
}
function Ur({ a: e, focused: t, onActor: n, quiet: r }) {
	let i = mt(e.status), a = u();
	return /* @__PURE__ */ m("div", {
		className: "kt-lane-id",
		children: [
			/* @__PURE__ */ p("button", {
				type: "button",
				className: "kt-avatar",
				onClick: () => n(e.key),
				"aria-pressed": t,
				"aria-label": t ? `不再只看${e.title}` : `只看${e.title}`,
				title: t ? "再点一次看全部" : "只看这一环",
				children: /* @__PURE__ */ p(V, {
					role: e.icon,
					size: 22
				})
			}),
			/* @__PURE__ */ m("div", {
				className: "kt-lane-who",
				children: [
					/* @__PURE__ */ p("div", {
						className: "kt-lane-name",
						children: /* @__PURE__ */ p("span", { children: e.title })
					}),
					/* @__PURE__ */ p("div", {
						className: "kt-lane-doing",
						children: e.sub
					}),
					/* @__PURE__ */ p("div", {
						className: "kt-lane-tag",
						children: /* @__PURE__ */ m("span", {
							className: `kt-pill tone-${i.tone}${e.status === "running" || e.status === "awaiting_approval" ? " is-live" : ""}`,
							title: i.hint,
							children: [/* @__PURE__ */ p("i", {
								"aria-hidden": "true",
								children: i.icon
							}), i.label]
						})
					})
				]
			}),
			e.status !== "waiting" && /* @__PURE__ */ m("p", {
				className: "kt-lane-stats",
				children: [e.since !== null && /* @__PURE__ */ m("span", {
					title: X(e.since),
					children: ["⏱ ", /* @__PURE__ */ p("b", { children: /* @__PURE__ */ p(Wr, { at: e.since }) })]
				}), e.credits !== null && /* @__PURE__ */ m("span", { children: [/* @__PURE__ */ p("b", { children: St(e.credits) }), " credits"] })]
			}),
			!r && e.session && /* @__PURE__ */ p("button", {
				type: "button",
				className: "kt-out-btn",
				onClick: () => a(e.session.url),
				title: "在 Kiro Crew 里打开它的会话",
				children: "打开会话 ›"
			})
		]
	});
}
function Wr({ at: e }) {
	let t = Kt();
	return /* @__PURE__ */ p(f, { children: xt(t - e) });
}
function Gr({ a: e, quiet: t }) {
	let n = mt(e.status), r = {
		awaiting_approval: "✋ 等你：",
		failed: "✕ 没过：",
		stalled: "⚠ 卡住：",
		fixing: "↻ 返工：",
		queued: "⏸ 排队：",
		merged: "✔ 完成",
		done: "✓ 做完这步",
		running: "● 在做：",
		waiting: "还没轮到："
	}[e.status] ?? n.label, i = r.replace(/[：:]$/, ""), a = !e.doing || e.doing === n.label || e.doing === i;
	return /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("div", {
		className: `kt-situation tone-${n.tone}`,
		children: [/* @__PURE__ */ p("strong", { children: a ? i : r }), !a && /* @__PURE__ */ p("span", {
			className: "kt-summary",
			children: e.doing
		})]
	}), !t && e.line && /* @__PURE__ */ p(q, {
		line: e.line,
		sessionUrl: e.session?.url ?? null
	})] });
}
function Kr({ a: e }) {
	let t = e.marks.slice().reverse().slice(0, 4);
	return !e.facts.length && !t.length ? /* @__PURE__ */ p("p", {
		className: "kt-dim kt-nothing",
		children: "还没有记录"
	}) : /* @__PURE__ */ m(f, { children: [e.facts.length > 0 && /* @__PURE__ */ p("ul", {
		className: "kt-tools br-facts-chips",
		"aria-label": "事实",
		children: e.facts.map((e) => /* @__PURE__ */ p("li", { children: /* @__PURE__ */ p("span", {
			className: "kt-mono br-fact",
			children: e
		}) }, e))
	}), t.length > 0 && /* @__PURE__ */ p("ul", {
		className: "kt-commits",
		"aria-label": "最近的记录",
		children: t.map((e, t) => /* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("code", {
			className: `br-mark is-${e.kind}`,
			children: Br[e.kind] ?? e.kind
		}), /* @__PURE__ */ m("span", {
			title: e.title,
			children: [
				X(e.at),
				" · ",
				e.title
			]
		})] }, t))
	})] });
}
function qr(e) {
	let t = e.events.map((e) => e.at), n = Math.min(e.started_at ?? Infinity, ...t), r = Number.isFinite(n) ? n : e.at, i = t.length ? Math.max(...t) : r;
	return {
		start: r,
		end: Math.max(e.ended_at ?? i, i, r + 1)
	};
}
function Jr(e, t = 900) {
	let n = qr(e), r = [.../* @__PURE__ */ new Set([
		n.start,
		...e.events.map((e) => e.at).filter((e) => e >= n.start && e <= n.end),
		n.end
	])].sort((e, t) => e - t), i = [[r[0], 0]];
	for (let e = 1; e < r.length; e++) {
		let n = r[e] - r[e - 1];
		i.push([r[e], i[e - 1][1] + Math.min(n, t)]);
	}
	let a = i[i.length - 1][1];
	return {
		total: a,
		toPlay: (e) => {
			if (e <= i[0][0]) return 0;
			for (let t = 1; t < i.length; t++) {
				let [n, r] = i[t], [a, o] = i[t - 1];
				if (e <= n) return n > a ? o + (e - a) / (n - a) * (r - o) : r;
			}
			return a;
		},
		toReal: (e) => {
			if (e <= 0) return i[0][0];
			for (let t = 1; t < i.length; t++) {
				let [n, r] = i[t], [a, o] = i[t - 1];
				if (e <= r) return r > o ? a + (e - o) / (r - o) * (n - a) : n;
			}
			return i[i.length - 1][0];
		}
	};
}
var Yr = (e) => ({
	status: "waiting",
	doing: e.status === "waiting" ? e.doing : "还没轮到",
	since: null
});
function Xr(e, t) {
	if (t >= qr(e).end) return e;
	let n = e.actors.map((e) => {
		let n = [...e.history].reverse().find((e) => e.at <= t), r = n ? {
			status: n.status,
			doing: n.doing,
			since: n.at
		} : Yr(e);
		return {
			...e,
			...r,
			line: null,
			spans: e.spans.filter((e) => e.a <= t).map((e) => ({
				...e,
				b: e.b !== null && e.b <= t ? e.b : null
			})),
			marks: e.marks.filter((e) => e.at <= t),
			facts: [],
			credits: null
		};
	}), r = new Map(n.map((e) => [e.key, e.status])), i = e.checks.cells.map((e) => e.at !== null && e.at <= t || e.at === null && e.status === "wait" && e.actor && r.get(e.actor) === "awaiting_approval" ? e : {
		...e,
		status: "skip",
		at: null,
		detail: "还没到这一步"
	}), a = i.filter((e) => e.status === "pass").length, o = i.filter((e) => e.status === "fail").length, s = n.find((e) => e.status === "awaiting_approval"), c = n.some((e) => e.status === "running" || e.status === "fixing"), l = r.get("release"), u = e.ended_at !== null && e.ended_at <= t, d = Qr(e, t, r, u);
	return {
		...e,
		row: {
			...e.row,
			state: d,
			state_label: Zr[d]
		},
		ended_at: u ? e.ended_at : null,
		live: c,
		person: {
			...e.person,
			status: s ? "awaiting_approval" : c ? "running" : "waiting",
			doing: s ? s.doing : c ? "AI 在做" : "没有等你的事"
		},
		actors: n,
		events: e.events.filter((e) => e.at <= t),
		belt: e.belt.filter((e) => e.at <= t),
		checks: {
			...e.checks,
			cells: i,
			passed: a,
			failed: o,
			total: i.filter((e) => e.status !== "skip").length,
			at: Math.max(0, ...i.filter((e) => e.at !== null).map((e) => e.at)) || null,
			history: e.checks.history.filter((e) => e.at <= t)
		},
		accept: {
			...e.accept,
			state: l === "awaiting_approval" ? "waiting" : l === "merged" ? "accepted" : l === "fixing" ? "rejected" : "not_yet",
			step: {
				text: "",
				who: "",
				line: null,
				mr_url: null,
				session_url: null
			},
			done: null
		}
	};
}
var Zr = {
	claimed: "已认领",
	local: "本地开发中",
	handed_over: "已交接",
	rejected: "接手被拒",
	running: "运行机在跑",
	parked: "停下等回答",
	acceptance: "等验收",
	merged: "已合并",
	closed: "已关闭"
};
function Qr(e, t, n, r) {
	if (r) return e.row.state === "closed" ? "closed" : "merged";
	let i = (n) => e.events.some((e) => e.kind === n && e.at <= t);
	return n.get("release") === "awaiting_approval" ? "acceptance" : i("handover") ? n.get("handover") === "failed" ? "rejected" : ["bridge", "runner"].some((e) => n.get(e) === "awaiting_approval") ? "parked" : n.get("runner") === "running" || n.get("runner") === "fixing" ? "running" : "handed_over" : i("start") || e.events.some((e) => e.kind !== "claim" && e.at <= t) ? "local" : "claimed";
}
var $r = [
	1,
	2,
	4
];
function ei(e, n) {
	let [s, c] = o({
		on: !1,
		p: 0,
		speed: 1,
		playing: !1
	}), l = a(null), u = a(null), d = a(!1);
	s.on || (l.current = e);
	let f = s.on ? l.current : null, p = i(() => f ? Jr(f) : null, [f]), m = i(() => f ? qr(f) : null, [f]), h = p?.total ?? 0, g = p ? p.toReal(s.p) : 0, _ = t(() => {
		l.current = e, u.current = null, c({
			on: !0,
			p: 0,
			speed: 1,
			playing: !0
		});
	}, [e]), v = t(() => {
		u.current = null, c({
			on: !1,
			p: 0,
			speed: 1,
			playing: !1
		});
	}, []), y = t(() => c((e) => e.p >= h ? (d.current = !0, u.current = null, {
		...e,
		p: 0,
		playing: !0
	}) : {
		...e,
		playing: !e.playing
	}), [h]), b = t(() => c((e) => ({
		...e,
		playing: !1
	})), []), x = t((e) => {
		d.current = !0, c((t) => ({
			...t,
			p: e
		}));
	}, []), S = t((e) => c((t) => ({
		...t,
		speed: e
	})), []);
	r(() => {
		if (!s.on || !s.playing || !h) return;
		let e = h / 60 * (250 / 1e3), t = setInterval(() => c((t) => {
			let n = Math.min(h, t.p + e * t.speed);
			return {
				...t,
				p: n,
				playing: n < h
			};
		}), 250);
		return () => clearInterval(t);
	}, [
		s.on,
		s.playing,
		h
	]);
	let C = i(() => f && m ? Xr(f, g) : null, [
		f,
		m,
		g
	]);
	r(() => {
		if (!C) return;
		let e = Math.max(30, h / 60 * s.speed * (250 / 1e3) * 2), t = yr(u.current, C, {
			at: g,
			resync: d.current,
			lateS: e
		});
		d.current = !1, u.current = C, n(t);
	}, [C]);
	let w = i(() => C ? {
		at: g,
		receivedAt: Infinity
	} : null, [C, g]);
	return {
		on: s.on,
		board: C,
		clock: w,
		span: m,
		p: s.p,
		total: h,
		t: g,
		speed: s.speed,
		playing: s.playing,
		start: _,
		exit: v,
		toggle: y,
		pause: b,
		seek: x,
		setSpeed: S
	};
}
function ti({ rp: e }) {
	if (!e.on || !e.span) return null;
	let t = e.p >= e.total;
	return /* @__PURE__ */ m("div", {
		className: "kt-replay",
		role: "group",
		"aria-label": "回放",
		"data-testid": "br-replay",
		children: [
			/* @__PURE__ */ p("span", {
				className: "kt-pill tone-info",
				children: "回放"
			}),
			/* @__PURE__ */ p("button", {
				type: "button",
				className: "kt-btn kt-btn-icon",
				onClick: e.toggle,
				"aria-label": e.playing ? "暂停" : t ? "从头再放" : "播放",
				title: e.playing ? "暂停" : t ? "从头再放" : "播放",
				children: e.playing ? "⏸" : t ? "↺" : "▶"
			}),
			/* @__PURE__ */ p("input", {
				type: "range",
				className: "kt-replay-scrub",
				"aria-label": "回放进度",
				min: 0,
				max: Math.max(1, Math.round(e.total)),
				step: 1,
				value: Math.min(e.total, Math.round(e.p)),
				onChange: (t) => e.seek(Number(t.target.value))
			}),
			/* @__PURE__ */ m("span", {
				className: "kt-mono kt-replay-time",
				title: "这一刻的真实时间",
				children: [
					X(e.t),
					" · 第 ",
					bt(e.t - e.span.start)
				]
			}),
			/* @__PURE__ */ p("span", {
				className: "kt-replay-speeds",
				role: "radiogroup",
				"aria-label": "倍速",
				children: $r.map((t) => /* @__PURE__ */ m("button", {
					type: "button",
					role: "radio",
					"aria-checked": e.speed === t,
					className: `kt-btn${e.speed === t ? " is-on" : ""}`,
					onClick: () => e.setSpeed(t),
					children: [t, "×"]
				}, t))
			}),
			/* @__PURE__ */ p("span", {
				className: "kt-dim kt-replay-note",
				children: t ? "放完了：下面是这个需求最后的样子" : "按记录重放：安静的时段缩短了，不调用 agent"
			}),
			/* @__PURE__ */ p("button", {
				type: "button",
				className: "kt-btn",
				onClick: e.exit,
				children: "退出回放"
			})
		]
	});
}
//#endregion
//#region src/board/useBoard.ts
function ni(e, n) {
	let i = n.pollMs ?? 2e3, [s, c] = o({
		board: null,
		error: "",
		missing: !1,
		loading: !0,
		receivedAt: 0
	}), l = It(e), u = It(n.onDiff), d = w.board(n.repo, n.reqKey), f = It(d), p = a(!1), m = a(null), h = a(!1), g = a(() => {}), _ = t(async () => {
		if (p.current) return;
		p.current = !0;
		let e = f.current;
		try {
			let t = await l.current.get(e);
			if (e !== f.current) return;
			let n = typeof document > "u" || !document.hidden, r = yr(m.current, t, {
				at: t.at,
				resync: h.current
			});
			m.current = t, n && (h.current = !1), c({
				board: t,
				error: "",
				missing: !1,
				loading: !1,
				receivedAt: Date.now()
			}), u.current?.(r, t);
		} catch (t) {
			if (e !== f.current) return;
			c((e) => ({
				...e,
				error: T(t),
				missing: E(t) === 404,
				loading: !1
			}));
		} finally {
			p.current = !1;
		}
	}, [
		l,
		f,
		u
	]);
	r(() => {
		let e, t = !0, n = 0;
		m.current = null;
		let r = (t) => {
			clearTimeout(e);
			let r = ++n;
			e = setTimeout(() => void a(r), t);
		}, a = async (e) => {
			t && e === n && (document.hidden ? h.current = !0 : (await _(), t && e === n && i > 0 && r(i)));
		}, o = () => {
			document.hidden ? (h.current = !0, clearTimeout(e), n++) : r(0);
		};
		return g.current = () => r(0), r(0), document.addEventListener("visibilitychange", o), () => {
			t = !1, clearTimeout(e), g.current = () => {}, document.removeEventListener("visibilitychange", o);
		};
	}, [
		_,
		i,
		d
	]);
	let v = t(() => g.current(), []);
	return {
		...s,
		reload: v
	};
}
//#endregion
//#region src/board/BoardPage.tsx
var ri = {
	req: null,
	flips: {},
	flashes: {},
	bumps: {},
	belt: /* @__PURE__ */ new Set(),
	fresh: /* @__PURE__ */ new Set(),
	announce: ""
};
function ii(e, t) {
	if (t.first || e.req !== t.req) return {
		...ri,
		req: t.req
	};
	let n = { ...e.flips };
	for (let e of t.flips) n[e.id] = (n[e.id] ?? 0) + 1;
	let r = { ...e.flashes };
	for (let e of t.flashes) r[e.target] = {
		n: (r[e.target]?.n ?? 0) + 1,
		tone: e.tone
	};
	let i = { ...e.bumps };
	for (let e of t.actors) i[e.key] = (i[e.key] ?? 0) + 1;
	return {
		req: t.req,
		flips: n,
		flashes: r,
		bumps: i,
		belt: new Set(t.belt),
		fresh: new Set(t.fresh.map((e) => e.seq)),
		announce: t.announce ?? e.announce
	};
}
function ai(e) {
	let t = e.actors.filter((e) => gt.has(e.status) || e.status === "awaiting_approval");
	return t.sort((e, t) => (t.since ?? 0) - (e.since ?? 0)), t[0]?.key ?? null;
}
var oi = (e) => `${e.actors.map((e) => e.key).join(",")}|${+!!e.direct}|${Wn(e)}`;
function si({ entry: e, onBack: n, go: s, replace: l, pollMs: d }) {
	let h = c(), g = u(), _ = zt(), [v, y] = o(null), [b, x] = o(!1), [S, C] = o(ri), w = a(null), T = a(null), E = a(!1), D = t((e) => {
		e.items.length && w.current?.(e.items), C((t) => ii(t, e));
	}, []), O = t((e) => void (E.current || D(e)), [D]), k = ni(h, {
		repo: e.repo,
		reqKey: e.key,
		pollMs: d,
		onDiff: O
	}), A = ei(k.board, D);
	E.current = A.on;
	let j = A.board ?? k.board;
	r(() => C(ri), [A.on]);
	let M = a(!!e.replay);
	r(() => {
		if (A.on === M.current) return;
		M.current = A.on;
		let { replay: t, ...n } = e;
		l({
			kind: "board",
			...n,
			...A.on ? { replay: !0 } : {}
		});
	}, [A.on]);
	let N = a(!1);
	r(() => {
		if (N.current || !k.board) return;
		N.current = !0, e.replay && A.start();
		let t = e.focus === "accept" ? "#br-accept" : e.focus === "checks" ? "[data-testid=\"kt-wall\"]" : e.focus === "lanes" ? "[data-testid=\"kt-lanes\"]" : e.focus === "feed" ? "[data-testid=\"kt-feed\"]" : e.replay ? "[data-testid=\"kt-graph\"]" : "";
		t && setTimeout(() => T.current?.querySelector(t)?.scrollIntoView?.({
			behavior: "smooth",
			block: "start"
		}), 80);
	}, [k.board]);
	let P = j ? oi(j) : "", F = i(() => {
		if (!j) return null;
		let e = j.actors.map((e) => e.key);
		return yn(e, vn(new Set(e), j.direct), Wn(j));
	}, [P]), I = i(() => ({
		at: k.board?.at ?? Date.now() / 1e3,
		receivedAt: k.receivedAt || Date.now()
	}), [k.board?.at, k.receivedAt]), L = A.clock ?? I, R = t((e) => y((t) => t === e ? null : e), []), ee = b && j ? ai(j) : null;
	r(() => {
		ee && T.current?.querySelector(`[data-testid="kt-lane"][data-role="${ee}"]`)?.scrollIntoView?.({
			block: "nearest",
			behavior: _ ? "auto" : "smooth"
		});
	}, [ee, _]), r(() => {
		let e = (e) => e.key === "Escape" && y(null);
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, []);
	let te = () => s({
		kind: "item",
		repo: e.repo,
		key: e.key,
		from: "board"
	}), ne = () => s({
		kind: "new",
		...e.repo === "runner" ? {} : { repo: e.repo }
	}), z = t((e) => {
		let t = j?.actors.find((t) => t.key === e);
		if (t && !t.line && t.doing.includes("工具调用") && t.session?.url) return g(t.session.url);
		let n = t?.line ? `[data-testid="kt-lane"][data-role="${e}"]` : "#br-accept";
		T.current?.querySelector(n)?.scrollIntoView?.({
			behavior: "smooth",
			block: "center"
		}), y(e);
	}, [j, g]), B = A.on, re = j ? j.questions.filter((e) => e.state === "waiting" || e.state === "open") : [], ie = !!j && (j.accept.step.text !== "" || j.accept.state !== "not_yet");
	return /* @__PURE__ */ m("main", {
		ref: T,
		className: `kt-root br-view br-board${j?.live && !B ? " is-live" : ""}`,
		"data-testid": "br-board",
		"data-motion": _ ? "reduce" : void 0,
		children: [/* @__PURE__ */ p("style", { children: wr }), /* @__PURE__ */ m(Gt.Provider, {
			value: L,
			children: [
				/* @__PURE__ */ m("nav", {
					className: "kit-crumb kt-where",
					"aria-label": "位置",
					"data-testid": "kt-where",
					children: [
						/* @__PURE__ */ p("button", {
							type: "button",
							onClick: () => s({ kind: "overview" }),
							children: "交付总览"
						}),
						/* @__PURE__ */ p("span", {
							"aria-hidden": "true",
							children: "›"
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							onClick: te,
							title: "需求详情",
							children: e.key
						}),
						/* @__PURE__ */ p("span", {
							"aria-hidden": "true",
							children: "›"
						}),
						/* @__PURE__ */ m("b", { children: [
							"需求看板",
							v && j ? ` · ${j.actors.find((e) => e.key === v)?.title ?? ""}` : "",
							A.on ? " · 回放" : ""
						] }),
						/* @__PURE__ */ p("span", { className: "kt-grow" }),
						n && /* @__PURE__ */ m("button", {
							type: "button",
							className: "kt-btn",
							onClick: n,
							children: ["← 返回", e.from === "item" ? "需求详情" : e.from === "todo" ? "待办" : "交付总览"]
						})
					]
				}),
				/* @__PURE__ */ p(Y, {
					loading: k.loading,
					error: k.missing ? `没有这个需求（${e.repo} · ${e.key}）：它可能已经不在这个仓库里` : k.error,
					has: !!j
				}),
				j && F && /* @__PURE__ */ m(f, { children: [
					/* @__PURE__ */ p(Tr, {
						board: j,
						replaying: A.on,
						follow: b,
						onReplay: A.start,
						onFollow: () => x((e) => !e),
						onDetail: te,
						onSession: (e) => g(e),
						onStart: e.repo === "runner" ? void 0 : ne
					}),
					/* @__PURE__ */ p(ti, { rp: A }),
					j.error && /* @__PURE__ */ p("div", {
						className: "kt-banner",
						role: "status",
						children: j.error
					}),
					j.row.state === "claimed" && !A.on ? /* @__PURE__ */ p(Nr, {
						board: j,
						onStart: e.repo === "runner" ? void 0 : ne
					}) : /* @__PURE__ */ m(f, { children: [
						/* @__PURE__ */ p(Er, {
							board: j,
							reducedMotion: _,
							onActor: R
						}, `${A.on ? "replay" : "live"}`),
						ie && /* @__PURE__ */ p(jt, {
							board: j,
							onDetail: te,
							onBrain: () => s({
								kind: "brain",
								repo: e.repo,
								reflect: e.key
							}),
							quiet: B
						}),
						/* @__PURE__ */ m("div", {
							className: "kt-body",
							children: [/* @__PURE__ */ m("div", {
								className: "kt-col",
								children: [
									/* @__PURE__ */ p(Gn, {
										board: j,
										lay: F,
										focus: v,
										onActor: R,
										flashes: S.flashes,
										reducedMotion: _,
										feed: w,
										quiet: B,
										onSession: (e) => g(e),
										onAct: B ? void 0 : z
									}, `${e.repo}/${e.key}${A.on ? ":replay" : ""}`),
									v && /* @__PURE__ */ p(ci, {
										board: j,
										focus: v,
										onClear: () => y(null)
									}),
									/* @__PURE__ */ p(xr, {
										board: j,
										fresh: S.belt,
										focus: v,
										onActor: R
									}),
									/* @__PURE__ */ p(Pr, {
										board: j,
										focus: v,
										bumps: S.bumps,
										onActor: R,
										quiet: B
									}),
									!ie && /* @__PURE__ */ p(jt, {
										board: j,
										onDetail: te,
										onBrain: () => s({
											kind: "brain",
											repo: e.repo,
											reflect: e.key
										}),
										quiet: B
									})
								]
							}), /* @__PURE__ */ m("aside", {
								className: "kt-side",
								"aria-label": "检查、问题和事件",
								children: [
									/* @__PURE__ */ p(sr, {
										board: j,
										focus: v,
										onActor: R,
										flips: S.flips
									}),
									!B && re.length > 0 && /* @__PURE__ */ m("section", {
										className: "kt-card br-board-qs",
										"aria-label": "等回答的问题",
										"data-testid": "br-board-questions",
										children: [/* @__PURE__ */ m("header", {
											className: "kt-card-head",
											children: [/* @__PURE__ */ p("h2", { children: "等回答的问题" }), /* @__PURE__ */ p("span", {
												className: "kt-badge tone-approve",
												children: re.length
											})]
										}), re.map((t, n) => /* @__PURE__ */ p(lt, {
											q: t,
											repo: e.repo,
											reqKey: e.key,
											onAnswered: k.reload
										}, `${t.id ?? "q"}-${n}`))]
									}),
									/* @__PURE__ */ p(Sr, {
										board: j,
										focus: v,
										onActor: R,
										fresh: S.fresh
									})
								]
							})]
						})
					] })
				] }),
				/* @__PURE__ */ p("div", {
					className: "kt-sr",
					"aria-live": "polite",
					"data-testid": "kt-announce",
					children: S.announce
				})
			]
		})]
	});
}
function ci({ board: e, focus: t, onClear: n }) {
	let r = e.actors.find((e) => e.key === t);
	return r ? /* @__PURE__ */ m("div", {
		className: "kt-focuschip",
		role: "status",
		"data-testid": "kt-focusbar",
		children: [
			/* @__PURE__ */ p(V, {
				role: r.icon,
				size: 14
			}),
			" ",
			r.title,
			/* @__PURE__ */ p("button", {
				type: "button",
				onClick: n,
				"aria-label": "看全部",
				title: "看全部（Esc）",
				children: "✕"
			})
		]
	}) : null;
}
var li = `
.kt-root, .br-app {
  --kt-run: #3cc4ff; --kt-fix: #ff9f43; --kt-ok: #3ee08f; --kt-ok-solid: #0b7a4b; --kt-done: #7fe3b8;
  --kt-queue: #9ba6ff; --kt-warn: #ffc53d; --kt-approve: #ff6ec7; --kt-bad: #ff5d6c; --kt-bad-solid: #c4253a;
  --kt-handoff: #b48cff; --kt-info: #8fb8ff; --kt-idle: var(--muted, #938f9b);
  --kt-on: #16121b; --kt-seg-l: .74; --kt-seg-c: .12; --kt-glass: color-mix(in srgb, var(--text, #dcdadf) 4%, transparent);
}
.kt-root {
  color: var(--text); font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 1.45;
  display: flex; flex-direction: column; gap: 14px; padding: 16px 20px 28px; min-height: 100%; box-sizing: border-box;
}
:root[data-mode="light"] .kt-root, :root[data-mode="light"] .br-app {
  --kt-run: #0a6db5; --kt-fix: #c05200; --kt-ok: #0a7d45; --kt-ok-solid: #0a7d45; --kt-done: #0a7d45;
  --kt-queue: #4a4fd1; --kt-warn: #946200; --kt-approve: #b8237a; --kt-bad: #c8243b; --kt-bad-solid: #c8243b;
  --kt-handoff: #7b3fe4; --kt-info: #285092; --kt-on: #fff; --kt-seg-l: .62; --kt-seg-c: .13;
}
.kt-root *, .kt-root *::before, .kt-root *::after { box-sizing: border-box; }
${[
	"run",
	"fix",
	"ok",
	"done",
	"queue",
	"warn",
	"approve",
	"bad",
	"idle",
	"handoff",
	"info"
].map((e) => `.kt-root .tone-${e}, .br-app .tone-${e} { --kt-tone: var(--kt-${e}); }`).join("\n")}
.kt-root :is(span, strong, b, em, time)[class*="tone-"] { color: var(--kt-tone); }
.kt-mono { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace); }
.kt-dim { color: var(--muted); }
.kt-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.kt-root :is(button, select, textarea, summary, input):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.kt-root code { font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.kt-loading { color: var(--muted); margin: 24px 0; }

/* ---------- buttons, pills, banners ---------- */
.kt-btn { appearance: none; font: inherit; font-size: .93em; font-weight: 650; padding: 7px 14px; border-radius: 10px; cursor: pointer;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); transition: border-color .15s, background .15s; white-space: nowrap; }
.kt-btn:hover { border-color: var(--accent); }
.kt-btn:disabled { opacity: .6; cursor: progress; }
.kt-btn.is-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
.kt-btn.is-primary:hover { filter: brightness(1.08); }
.kt-btn.is-danger { color: var(--kt-bad); border-color: color-mix(in srgb, var(--kt-bad) 55%, var(--border)); }
.kt-btn.is-danger.is-solid { background: var(--kt-bad-solid); border-color: var(--kt-bad-solid); color: #fff; }
.kt-btn[aria-pressed="true"], .kt-btn.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--card)); color: var(--text-strong); }
.kt-select { font: inherit; font-size: .93em; padding: 7px 10px; border-radius: 10px; border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); max-width: 360px; }
.kt-pill { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 999px; font-size: .86em; font-weight: 750; white-space: nowrap;
  color: var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--kt-tone) 42%, transparent); }
.kt-pill i { font-style: normal; font-size: .9em; }
.kt-pill.is-live i { animation: kt-blink 1.6s ease-in-out infinite; }
.kt-root span.kt-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 999px; font-size: .74em; font-weight: 800; background: var(--kt-tone); color: var(--kt-on); white-space: nowrap; }
.kt-banner { padding: 8px 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 10%, var(--card)); }
.kt-banner.is-error { border-color: color-mix(in srgb, var(--kt-bad) 60%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 10%, var(--card)); }
.kt-replay { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 12px; border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--kt-info, #60a5fa) 45%, var(--border)); background: color-mix(in srgb, var(--kt-info, #60a5fa) 8%, var(--card)); }
.kt-replay-scrub { flex: 1 1 240px; min-width: 160px; accent-color: var(--kt-info, #60a5fa); }
.kt-replay-time { font-size: .93em; min-width: 9ch; }
.kt-replay-speeds { display: inline-flex; gap: 4px; }
.kt-replay-speeds .kt-btn { padding: 4px 9px; font-size: .85em; }
.kt-replay-note { font-size: .86em; }
.kt-error { margin: 0; color: var(--kt-bad); font-weight: 650; }
.kt-focusbar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 8px 6px 14px; border-radius: 12px;
  border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--card)); }

/* ---------- top bar ---------- */
.kt-top { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }
.kt-title { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; min-width: 0; flex: 1 1 480px; } /* a laptop-wide window: the buttons go to the next line, not the title into a column */
.kt-title h1 { margin: 0; font-size: 1em; font-weight: 700; color: var(--muted); letter-spacing: .04em; }
.kt-run-title { font-size: 1.65em; font-weight: 800; color: var(--text-strong); letter-spacing: -.01em; }
.kt-run-meta { font-size: .82em; color: var(--muted); }
.kt-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kt-start { display: grid; gap: 8px; padding: 14px 16px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); }
.kt-start label { font-weight: 750; color: var(--text-strong); }
.kt-start textarea { font: inherit; resize: vertical; min-height: 86px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); color: var(--text); }
.kt-start-actions, .kt-confirm-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.kt-pick { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px dashed var(--border-strong, var(--border)); background: var(--bg); font-size: .92em; }
.kt-pick.is-empty { color: var(--muted); }
.kt-pick p { margin: 0; }
.kt-pick-why b, .kt-pick-team b { color: var(--text-strong); }
.kt-pick-phases { list-style: none; margin: 2px 0; padding: 0; display: grid; gap: 4px; }
.kt-pick-phases li { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.kt-pick-phase { min-width: 6.5em; font-weight: 700; color: var(--muted); }
.kt-pick-role { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border-radius: 999px; background: var(--card); border: 1px solid var(--border); }
.kt-pick-role em { font-style: normal; color: var(--kt-approve); font-weight: 700; }
.kt-pick-roster { display: flex; flex-wrap: wrap; gap: 4px; }
.kt-pick-agent { padding: 1px 7px; border-radius: 6px; font-size: .86em; color: var(--muted); opacity: .45; border: 1px solid var(--border); }
.kt-pick-agent.is-used { opacity: 1; color: var(--text-strong); border-color: var(--kt-ok, var(--border-strong)); font-weight: 700; }
.kt-warn { color: var(--kt-warn); font-weight: 700; }
.kt-cleanup-msg { margin: 0; cursor: pointer; }
.kt-pick-role > span { display: inline-flex; flex-direction: column; line-height: 1.25; }
.kt-pick-role small { font-size: .82em; color: var(--muted); font-weight: 500; }
.kt-pick-role.is-absent { border-style: dashed; border-color: var(--kt-warn); }
.kt-pick-agent.is-custom::after { content: ' ★'; color: var(--kt-approve); }
.kt-pick-std { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0; }
.kt-pick-agent.is-data { border-style: dashed; }
.kt-scenarios { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.kt-scenario { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; text-align: left; font: inherit; }
.kt-scenario b { font-size: 1.02em; }
.kt-scenario small { color: var(--muted); font-size: .85em; }
.kt-scenario.is-on { border-color: var(--kt-on, var(--kt-run)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 35%, transparent); }
.kt-kb { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 14px; } /* frame: kit.ts */
.kt-kb-col { min-width: 0; }
.kt-kb-head { display: flex; align-items: baseline; gap: 10px; margin: 0 0 6px; flex-wrap: wrap; }
.kt-kb-chips { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.kt-kb-chip { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--kt-info) 55%, var(--border)); background: color-mix(in srgb, var(--kt-info) 10%, transparent); }
.kt-kb-chip.is-data { border-style: dashed; border-color: color-mix(in srgb, var(--kt-handoff) 60%, var(--border)); background: color-mix(in srgb, var(--kt-handoff) 9%, transparent); }
.kt-kb-chip small { color: var(--muted); font-size: .8em; }
.kt-kb-chip .kt-mono { font-size: .82em; color: var(--muted); }
.kt-kb-hits { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; max-height: 132px; overflow: auto; }
.kt-kb-hits li { display: flex; align-items: baseline; gap: 8px; font-size: .92em; white-space: nowrap; }
.kt-kb-hits li.is-data .kt-kb-what { color: var(--kt-handoff); }
.kt-kb-what { overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1; }
.kt-kb-who { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; font-weight: 700; color: var(--text-strong); }
.kt-kb-empty { margin: 4px 0; }
.kt-gate-delivery { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 6px 0 8px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--kt-glass); }
.kt-gate-delivery legend { padding: 0 4px; font-size: .9em; color: var(--muted); }
.kt-gate-delivery input, .kt-gate-delivery select { font: inherit; font-size: .93em; padding: 4px 8px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }
.kt-gate-delivery input { width: 13em; }
.kt-gate-delivery .kt-gate-amount { width: 6em; }
.kt-gate-risk .kt-gate-what { width: 24em; }
.kt-sign-cto { margin-left: 10px; vertical-align: middle; }
.kt-gate-split { list-style: none; margin: 6px 0 8px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--kt-handoff) 8%, transparent); display: grid; gap: 3px; font-size: .92em; }
.kt-gate-split b { margin-right: 6px; }
.kt-gate-split.is-out { background: color-mix(in srgb, var(--kt-warn) 10%, transparent); }
.kt-focuschip { position: sticky; top: 8px; z-index: 3; margin: -6px 0 6px auto; width: max-content; display: inline-flex; align-items: center; gap: 6px; padding: 4px 6px 4px 10px; border-radius: 999px; border: 1px solid var(--kt-on, var(--border)); background: var(--card); font-size: .9em; font-weight: 700; }
.kt-focuschip button { all: unset; cursor: pointer; padding: 0 6px; border-radius: 999px; color: var(--muted); }
.kt-focuschip button:hover { color: var(--text-strong); }
.kt-wall-src { font-size: .85em; color: var(--muted); }
.kt-req-hint { margin: 2px 0 6px; font-size: .88em; }
.kt-btn-icon { padding-left: 9px; padding-right: 9px; }
.kt-expert.is-joined { opacity: .75; border-style: dashed; }
.kt-start-more { margin: 8px 0; }
.kt-start-more > summary { cursor: pointer; color: var(--muted); font-size: .9em; }
.kt-ncard { position: absolute; z-index: 6; width: 300px; max-width: 34%; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--border-strong, var(--border)); background: var(--card); box-shadow: 0 14px 40px rgba(0,0,0,.35); font-size: 13px; }
.kt-ncard-body p { margin: 0 0 6px; }
.kt-ncard-head { display: flex; align-items: center; gap: 6px; font-size: 14px; }
.kt-ncard-head .kt-pill { margin-left: auto; }
.kt-ncard-task .kt-dim { margin-right: 4px; }
.kt-ncard-back { color: var(--kt-fix); font-weight: 650; }
.kt-ncard-did { color: var(--text); line-height: 1.45; max-height: 6.2em; overflow: hidden; }
.kt-ncard-facts { list-style: none; margin: 0 0 8px; padding: 0; display: grid; gap: 2px; color: var(--muted); }
.kt-ncard-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.kt-ncard-actions .kt-btn { font-size: 12px; padding: 4px 10px; }
.kt-gate-report { margin: 6px 0 8px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--kt-info) 9%, transparent); display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; font-size: .94em; }
.kt-gate-report .kt-btn { margin-left: auto; font-size: 12px; padding: 3px 9px; }
.kt-sign-back { color: var(--kt-fix); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
/* .kt-sign: framed by kit.ts (a border for its state: magenta waiting, green signed) */

.kt-sign-head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.kt-sign-head h2 { margin: 0; font-size: 1.25em; }
.kt-sign-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 18px; margin: 10px 0; }
.kt-sign-grid dt { font-size: .82em; color: var(--muted); font-weight: 700; }
.kt-sign-grid dd { margin: 2px 0 0; }
.kt-sign-grid ul { margin: 0; padding-left: 1.1em; }
.kt-sign-groups { display: flex; flex-wrap: wrap; gap: 4px 10px; list-style: none; padding: 0 !important; margin-top: 2px !important; font-size: .88em; }
.kt-sign-groups .is-ok { color: var(--kt-ok); }
.kt-sign-groups .is-bad { color: var(--kt-bad); }
.kt-sign-form { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.kt-sign-form input { padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--card); color: var(--text); font: inherit; }
.kt-sign-form input:first-child { width: 10em; }
.kt-sign-form input:nth-child(2) { flex: 1; min-width: 16em; }
.kt-sign-done { margin: 4px 0 0; font-size: 1.05em; }
.kt-sign-blocked { margin: 10px 0 0; padding: 8px 12px; border-radius: 10px; border: 1px dashed color-mix(in srgb, var(--kt-warn) 55%, var(--border)); color: var(--muted); }
.kt-ok { color: var(--kt-ok); }
.kt-bad { color: var(--kt-bad); }
.kt-lane-doing, .kt-node-task { }
.kt-experts { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; } /* frame: kit.ts */
.kt-experts-title { font-weight: 800; color: var(--text-strong); white-space: nowrap; }
.kt-experts-list { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; }
.kt-expert { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); font-size: .9em; }
.kt-expert small { font-size: .82em; font-weight: 700; }
.kt-expert.is-busy { border-color: var(--kt-run); background: color-mix(in srgb, var(--kt-run) 16%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 25%, transparent); }
.kt-expert.is-busy small { color: var(--kt-run); }
.kt-expert.is-used { border-color: color-mix(in srgb, var(--kt-ok) 60%, transparent); background: color-mix(in srgb, var(--kt-ok) 12%, transparent); }
.kt-expert.is-used small { color: var(--kt-ok); }
.kt-expert.is-team { border-style: dashed; color: var(--muted); }
.kt-expert.is-none { color: var(--muted); opacity: .45; }
.kt-expert.is-absent { border-style: dashed; border-color: var(--kt-warn); color: var(--kt-warn); }
.kt-expert.is-custom b::after { content: ' ★'; font-size: .8em; color: var(--kt-approve); }
.kt-confirm { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; padding: 12px 16px; border-radius: 14px;
  border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }
.kt-confirm strong { color: var(--text-strong); }
.kt-gate-dialog { border-color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 9%, var(--card)); }
.kt-gate-docs, .kt-gate-talk, .kt-gate-questions, .kt-gate-split, .kt-gate-report, .kt-gate-risk { flex: 1 1 100%; }
.kt-gate-docs { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 6px 0; font-size: .93em; }
.kt-gate-docs .kt-chip-link { display: inline-flex; align-items: center; gap: 4px; }
.kt-gate-talk { list-style: none; margin: 6px 0 8px; padding: 8px 10px; border-radius: 10px; background: var(--kt-glass); display: grid; gap: 6px; max-height: 260px; overflow: auto; font-size: .93em; }
.kt-gate-talk li { display: grid; grid-template-columns: 4.5em 1fr; gap: 8px; }
.kt-gate-talk li.is-person .kt-gate-talk-text { white-space: pre-wrap; }
.kt-gate-talk-text p { margin: 0 0 4px; }
.kt-gate-talk-text ul, .kt-gate-talk-text ol { margin: 0 0 4px; padding-left: 1.3em; }
.kt-gate-dialog.is-approve .kt-gate-talk { max-height: 180px; }
.kt-gate-talk li.is-person > b { color: var(--kt-approve); }
.kt-gate-questions { display: grid; gap: 8px; margin: 6px 0 8px; }
.kt-gate-q { margin: 0; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--kt-glass); display: grid; gap: 4px; }
.kt-gate-q legend { padding: 0 4px; font-size: .95em; }
.kt-gate-q label { display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap; font-size: .93em; cursor: pointer; }
.kt-gate-q label.is-picked > span { font-weight: 650; color: var(--text-strong); }
.kt-gate-rec { margin-left: 6px; padding: 0 6px; border-radius: 999px; font-style: normal; font-size: .85em; color: var(--kt-ok); border: 1px solid color-mix(in srgb, var(--kt-ok) 55%, var(--border)); }
.kt-gate-other { flex: 1 1 16em; font: inherit; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }
.kt-gate-differs { color: var(--kt-warn); font-weight: 650; }
.kt-gate-note { flex: 1 1 100%; min-height: 64px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); color: var(--text); font: inherit; resize: vertical; }

/* ---------- the counters ---------- */
.kt-kpis { display: grid; grid-template-columns: minmax(190px, 1.05fr) minmax(300px, 1.75fr) minmax(190px, 1fr) minmax(170px, .85fr) minmax(120px, .65fr); gap: 12px; }
@media (max-width: 1240px) { .kt-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kt-kpi-par, .kt-kpi-gates { grid-column: span 2; order: -1; } }
.kt-kpi { display: flex; flex-direction: column; gap: 5px; min-width: 0; } /* frame, glass, label and number: kit.ts */

.kt-kpi-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } /* type: kit.ts */
.kt-kpi-value { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; color: var(--text-strong); font-weight: 750; font-variant-numeric: tabular-nums; }
.kt-kpi-big { display: inline-block; } /* type: kit.ts */
.kt-kpi-big.is-pop { animation: kt-pop .7s cubic-bezier(.2,1.6,.4,1) 1; }

.kt-kpi-mid { font-size: 1.5em; font-weight: 800; color: var(--muted); }
.kt-kpi-note { font-size: .84em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.kt-kpi-tests.is-green .kt-kpi-big { color: var(--kt-ok); }
.kt-segs { display: flex; gap: 3px; margin-top: 2px; }
.kt-segs i { flex: 1; height: 9px; border-radius: 3px; background: color-mix(in srgb, var(--muted) 30%, transparent); transition: background .4s; }
.kt-segs i.is-pass { background: var(--kt-ok); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-ok) 55%, transparent); }
.kt-segs i.is-fail { background: var(--kt-bad); }
.kt-saving { display: inline-flex; align-items: baseline; gap: 6px; font-size: 1.15em; }

.kt-speedup { margin-left: auto; align-self: center; padding: 2px 10px; border-radius: 999px; font-size: 1em; font-weight: 800; color: var(--kt-handoff);
  background: color-mix(in srgb, var(--kt-handoff) 14%, transparent); border: 1px solid color-mix(in srgb, var(--kt-handoff) 42%, transparent); }
.kt-bars { display: grid; gap: 5px; margin-top: 2px; }
.kt-bar-row { display: grid; grid-template-columns: 4.6em minmax(0, 1fr) 4.4em; align-items: center; gap: 8px; font-size: .84em; }
.kt-bar-name { color: var(--muted); white-space: nowrap; }
.kt-bar-val { text-align: right; color: var(--text-strong); font-weight: 700; }
.kt-bar { display: flex; height: 11px; border-radius: 6px; background: color-mix(in srgb, var(--muted) 16%, transparent); overflow: hidden; }
.kt-bar.is-segs { gap: 2px; background: none; }
.kt-bar-wall { border-radius: 6px; background: linear-gradient(90deg, var(--kt-run), var(--kt-handoff)); box-shadow: 0 0 12px color-mix(in srgb, var(--kt-run) 45%, transparent); transition: width .9s; }
.kt-bar-seg { height: 100%; border-radius: 3px; background: oklch(var(--kt-seg-l) var(--kt-seg-c) var(--h)); transition: width .9s; }
.kt-role-dots { display: flex; gap: 4px; flex-wrap: wrap; }
.kt-role-dot { width: 26px; height: 26px; padding: 0; display: grid; place-items: center; border-radius: 8px; font: inherit; font-size: 14px; line-height: 1; cursor: pointer; border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }
.kt-role-dot:hover { transform: translateY(-1px); }
.kt-role-dot.tone-idle { border-style: dashed; filter: grayscale(.9); opacity: .55; }
.kt-role-dot.tone-ok { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); }
.kt-role-dot.is-working { box-shadow: 0 0 0 3px color-mix(in srgb, var(--kt-tone) 22%, transparent), 0 0 14px color-mix(in srgb, var(--kt-tone) 60%, transparent); animation: kt-glow 2.4s ease-in-out infinite; }
.kt-slots { display: flex; gap: 5px; flex-wrap: wrap; }
.kt-slots i { width: 22px; height: 22px; border-radius: 6px; border: 2px dashed var(--border-strong, var(--border)); }
.kt-slots i.is-on { border: 2px solid var(--kt-run); background: color-mix(in srgb, var(--kt-run) 32%, transparent); box-shadow: 0 0 10px color-mix(in srgb, var(--kt-run) 50%, transparent); }
.kt-slots i.is-queued { border: 2px dashed var(--kt-queue); background: color-mix(in srgb, var(--kt-queue) 20%, transparent); }
.kt-kpi-cap.is-queued { border-color: color-mix(in srgb, var(--kt-queue) 55%, var(--border)); }

.kt-gates-score { display: inline-flex; align-items: baseline; gap: 10px; }
.kt-gates-score .kt-kpi-mid { color: var(--kt-bad); }
.kt-gates-arrow { color: var(--muted); font-size: 22px; font-weight: 700; }
.kt-gates-rows { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; font-size: 13.5px; color: var(--muted); }
.kt-gates-rows b { color: var(--text-strong); font-size: 18px; margin: 0 2px; }
.kt-gates-rows .is-hit b { color: var(--kt-bad); }
.kt-used-row { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin-top: 6px; font-size: 13px; color: var(--muted); }
.kt-used-row b { color: var(--text-strong); font-weight: 800; }
.kt-used-dots { display: inline-flex; gap: 3px; margin-left: 4px; }
.kt-used-dots i { width: 9px; height: 9px; border-radius: 3px; background: color-mix(in srgb, var(--muted) 28%, transparent); }
.kt-used-dots i.is-on { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 55%, transparent); }

/* ---------- the team graph ---------- */
.kt-graph { position: relative; overflow: hidden; /* border, radius: kit.ts */
  background: radial-gradient(110% 80% at 50% -12%, color-mix(in srgb, var(--accent) 15%, transparent), transparent 62%),
    radial-gradient(60% 50% at 100% 100%, color-mix(in srgb, var(--kt-ok) 7%, transparent), transparent 70%), var(--card); }
.kt-graph-stage { position: relative; }
.kt-graph-svg { display: block; width: 100%; height: auto; user-select: none; overflow: visible; }
.kt-g-dot { fill: color-mix(in srgb, var(--muted) 30%, transparent); }
.kt-stage-band { fill: color-mix(in srgb, var(--text) 2.5%, transparent); stroke: color-mix(in srgb, var(--muted) 22%, transparent); stroke-dasharray: 2 6; transition: fill .6s, stroke .6s; }
.kt-stage.is-live .kt-stage-band { fill: color-mix(in srgb, var(--kt-run) 5%, transparent); stroke: color-mix(in srgb, var(--kt-run) 40%, transparent); stroke-dasharray: none; }
.kt-stage-title { fill: var(--muted); font-size: 15px; font-weight: 750; letter-spacing: .02em; }
.kt-stage.is-live .kt-stage-title { fill: var(--text-strong); }
.kt-phase-band { fill: color-mix(in srgb, var(--text) 2.5%, transparent); stroke: color-mix(in srgb, var(--muted) 26%, transparent); stroke-dasharray: 2 6; transition: fill .6s, stroke .6s; }
.kt-phase.is-live .kt-phase-band { fill: color-mix(in srgb, var(--kt-run) 5%, transparent); stroke: color-mix(in srgb, var(--kt-run) 45%, transparent); stroke-dasharray: none; }
.kt-phase.is-done .kt-phase-band { stroke: color-mix(in srgb, var(--kt-ok) 45%, transparent); stroke-dasharray: none; }
.kt-phase-title { fill: var(--muted); font-size: 16px; font-weight: 800; letter-spacing: .02em; }
.kt-phase-title.is-pick { cursor: pointer; }
.kt-phase-title.is-pick:hover { fill: var(--accent); text-decoration: underline; }
.kt-phase.is-focus .kt-phase-band { fill: color-mix(in srgb, var(--accent) 8%, transparent); stroke: var(--accent); stroke-width: 2; stroke-dasharray: none; }
.kt-phase.is-focus .kt-phase-title { fill: var(--accent); }
.kt-phase.is-off { opacity: .55; }
.kt-run-link { border: 0; background: transparent; padding: 0; font: inherit; cursor: pointer; text-align: left; }
.kt-run-link:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 4px; }
.kt-pill-btn { cursor: pointer; font: inherit; }
.kt-focuschip .kt-chip-link { border: 0; background: transparent; color: var(--accent); cursor: pointer; font: inherit; padding: 0 4px; }
.kt-phase.is-live .kt-phase-title, .kt-phase.is-done .kt-phase-title { fill: var(--text-strong); }
.kt-phase-en { font-size: 12px; font-weight: 600; fill-opacity: .7; }
.kt-phase.is-unused .kt-phase-band { fill: none; stroke: color-mix(in srgb, var(--muted) 30%, transparent); stroke-dasharray: 4 6; }
.kt-phase.is-unused .kt-phase-title { fill: color-mix(in srgb, var(--muted) 70%, transparent); }
.kt-phase-note { fill: color-mix(in srgb, var(--muted) 75%, transparent); font-size: 13px; font-weight: 650; }
.kt-orch-body { fill: color-mix(in srgb, var(--kt-run) 10%, var(--card)); stroke: color-mix(in srgb, var(--kt-run) 55%, transparent); stroke-width: 2; }
.kt-orch.is-active .kt-orch-body { stroke: var(--kt-run); }
.kt-orch-title { fill: var(--text-strong); font-size: 15px; font-weight: 850; letter-spacing: .02em; }
.kt-orch-cn { fill: var(--text-strong); font-size: 14px; font-weight: 700; }
.kt-orch-sub { fill: var(--muted); font-size: 11px; font-weight: 600; }
.kt-phase-stages { fill: var(--muted); font-size: 11.5px; font-weight: 600; }
.kt-cmd { fill: none; stroke: var(--kt-run); stroke-width: 2.4; stroke-linecap: round; stroke-dasharray: 7 7; opacity: .9; animation: kt-cmd-flow 1.1s linear infinite; }
.kt-cmd.is-fixing { stroke: var(--kt-fix); }
.kt-cmd.is-queued { stroke: var(--kt-queue); opacity: .55; animation: none; }
.kt-cmd.is-awaiting_approval, .kt-cmd.is-stalled { stroke: var(--kt-approve); }
@keyframes kt-cmd-flow { to { stroke-dashoffset: -28; } }
@media (prefers-reduced-motion: reduce) { .kt-cmd { animation: none; } }
.kt-roster-title { fill: var(--muted); font-size: 11.5px; font-weight: 750; }
.kt-roster-group { fill: var(--muted); font-size: 10.5px; font-weight: 750; letter-spacing: .02em; }
.kt-roster-item.is-busy rect { stroke: var(--kt-run); fill: color-mix(in srgb, var(--kt-run) 16%, transparent); }
.kt-roster-item.is-busy circle { fill: var(--kt-run); }
.kt-roster-item rect { fill: color-mix(in srgb, var(--muted) 8%, transparent); stroke: color-mix(in srgb, var(--muted) 25%, transparent); }
.kt-roster-item circle { fill: color-mix(in srgb, var(--muted) 45%, transparent); }
.kt-roster-item text { fill: color-mix(in srgb, var(--muted) 75%, transparent); font-size: 11.5px; font-weight: 600; }
.kt-roster-item.is-team rect { stroke: color-mix(in srgb, var(--kt-ok) 45%, transparent); stroke-dasharray: 3 3; }
.kt-roster-item.is-team text { fill: var(--text); }
.kt-roster-item.is-team circle { fill: var(--kt-ok); }
.kt-roster-item.is-team rect { stroke: color-mix(in srgb, var(--kt-ok) 70%, transparent); }
.kt-roster-item.is-bench text { fill: var(--muted); }
.kt-roster-item:not(.is-team) { opacity: .38; }
.kt-roster-item:not(.is-team) rect { stroke-dasharray: none; fill: transparent; }
.kt-roster-state { font-size: 10px !important; font-weight: 700 !important; }
.kt-roster-item.is-team:not(.is-used) .kt-roster-state { fill: var(--muted) !important; }
.kt-roster-item.is-used .kt-roster-state { fill: var(--kt-ok) !important; }
.kt-roster-item.is-busy .kt-roster-state { fill: var(--kt-run) !important; }
.kt-roster-item.is-used rect { fill: color-mix(in srgb, var(--kt-ok) 14%, transparent); stroke: color-mix(in srgb, var(--kt-ok) 60%, transparent); stroke-dasharray: none; }
.kt-roster-item.is-used circle { fill: var(--kt-ok); }
.kt-roster-item.is-used text { fill: var(--text-strong); }
.kt-roster-item.is-busy rect { fill: color-mix(in srgb, var(--kt-run) 22%, transparent); stroke: var(--kt-run); }
.kt-roster-item.is-busy circle { fill: var(--kt-run); filter: drop-shadow(0 0 4px var(--kt-run)); }
.kt-node.is-skipped { opacity: .45; }
.kt-node.is-skipped .kt-node-body { fill: none; stroke: color-mix(in srgb, var(--muted) 55%, transparent); stroke-dasharray: 3 5; }
.kt-node.is-skipped .kt-node-emoji { filter: grayscale(1); opacity: .5; }
.kt-node.is-skipped .kt-node-title { fill: var(--muted); }
.kt-gate-chip { cursor: pointer; }
.kt-gate-chip.is-static { cursor: default; }
.kt-gate-chip rect { fill: var(--kt-approve); stroke: color-mix(in srgb, #fff 40%, transparent); stroke-width: 1; }
.kt-gate-chip.is-revise rect { fill: var(--card); stroke: var(--kt-approve); }
.kt-gate-chip text { fill: #fff; font-size: 12.5px; font-weight: 800; }
.kt-gate-chip.is-revise text { fill: var(--kt-approve); }
.kt-gate-chip.is-discuss rect { fill: var(--card); stroke: var(--kt-approve); stroke-dasharray: 3 2; }
.kt-gate-chip.is-discuss text { fill: var(--kt-approve); }
.kt-gate-chip.is-talking rect { fill: color-mix(in srgb, var(--kt-approve) 14%, var(--card)); stroke: var(--kt-approve); }
.kt-gate-chip.is-talking text { fill: var(--kt-approve); font-weight: 700; }
.kt-gate-chip:hover rect, .kt-gate-chip:focus-visible rect { filter: brightness(1.12); stroke-width: 2; }
.kt-par rect { fill: color-mix(in srgb, var(--kt-run) 16%, var(--card)); stroke: var(--kt-run); stroke-width: 1.3; }
.kt-par text { fill: var(--kt-run); font-size: 13px; font-weight: 800; }
.kt-par-dot { fill: var(--kt-run); animation: kt-blink 2.4s ease-in-out infinite; }
.kt-edge { fill: none; stroke-width: 2.2; stroke-linecap: round; transition: opacity .3s, stroke-width .3s; }
.kt-edge.is-pending { stroke: var(--muted); opacity: .38; stroke-dasharray: 5 6; }
.kt-graph.is-phased .kt-edge:not(.is-hot) { opacity: .2; }
.kt-edge.is-ready { stroke: var(--kt-handoff); opacity: .5; }
.kt-edge.is-used { stroke: var(--kt-handoff); opacity: .78; }
.kt-edge.is-dim { opacity: .08; }
.kt-edge.is-hot { opacity: 1; stroke-width: 3.2; }
.kt-arrow.is-pending { fill: var(--muted); }
.kt-arrow.is-ready, .kt-arrow.is-used { fill: var(--kt-handoff); }

.kt-node { cursor: pointer; outline: none; transition: opacity .3s; }
.kt-node.is-dim { opacity: .26; }
.kt-node-body { fill: var(--bg-elevated, var(--card)); stroke: var(--border-strong, var(--muted)); stroke-width: 2; transition: fill .5s, stroke .5s; }
.kt-node-avatar { fill: color-mix(in srgb, var(--text) 7%, var(--card)); stroke: color-mix(in srgb, var(--muted) 40%, transparent); stroke-width: 1.5; }
.kt-node-emoji { color: var(--text-strong); }
.kt-node-title { fill: var(--text-strong); font-size: 18.5px; font-weight: 800; }
.kt-node-agent { font-size: 12px; font-weight: 600; fill-opacity: 0.7; letter-spacing: 0.02em; }
.kt-node-title.is-long { font-size: 15.5px; }
.kt-node-title.is-long .kt-node-agent { font-size: 10.5px; }
.kt-node-sub { fill: var(--muted); font-size: 13.5px; font-weight: 650; font-variant-numeric: tabular-nums; }
.kt-node-task { fill: var(--text); fill-opacity: 0.78; font-size: 12px; font-weight: 600; }
.kt-node-task.is-sent-back { fill: var(--kt-fix); fill-opacity: 1; }
.kt-node.is-waiting .kt-node-task, .kt-node.is-skipped .kt-node-task { fill: var(--muted); }
.kt-node-ticker { fill: var(--kt-run); font-size: 12.5px; font-weight: 600; font-family: var(--mono, ui-monospace, monospace); }
.kt-node.is-fixing .kt-node-ticker { fill: var(--kt-fix); }
.kt-node.is-stalled .kt-node-ticker { fill: var(--kt-warn); }
.kt-node.is-awaiting_approval .kt-node-ticker { fill: var(--kt-approve); }
.kt-node-focus { fill: none; stroke: var(--accent); stroke-width: 3; opacity: 0; }
.kt-node:focus-visible .kt-node-focus, .kt-node.is-focus .kt-node-focus { opacity: 1; }
.kt-node-halo { fill: none; stroke-width: 12; opacity: .4; filter: blur(6px); transform-box: fill-box; transform-origin: center; animation: kt-halo 2.4s ease-in-out infinite; }
.kt-node-spin { fill: none; stroke-width: 3; stroke-linecap: round; stroke-dasharray: 30 130; transform-box: fill-box; transform-origin: center; animation: kt-spin 1.5s linear infinite; }
.kt-node.is-waiting .kt-node-body { fill: color-mix(in srgb, var(--card) 65%, transparent); stroke: color-mix(in srgb, var(--muted) 55%, transparent); stroke-dasharray: 6 5; }
.kt-node.is-waiting .kt-node-emoji { filter: grayscale(1); opacity: .5; }
.kt-graph.is-phased .kt-node.is-waiting { opacity: .5; }
.kt-node.is-waiting .kt-node-title { fill: var(--muted); }
.kt-node.is-running .kt-node-body { stroke: var(--kt-run); stroke-width: 3; fill: color-mix(in srgb, var(--kt-run) 11%, var(--card)); }
.kt-node.is-running .kt-node-sub { fill: var(--kt-run); }
.kt-node.is-running :is(.kt-node-halo, .kt-node-spin) { stroke: var(--kt-run); }
.kt-node.is-fixing .kt-node-body { stroke: var(--kt-fix); stroke-width: 3; fill: color-mix(in srgb, var(--kt-fix) 12%, var(--card)); }
.kt-node.is-fixing .kt-node-sub { fill: var(--kt-fix); }
.kt-node.is-fixing :is(.kt-node-halo, .kt-node-spin) { stroke: var(--kt-fix); }
.kt-node.is-queued .kt-node-body { stroke: color-mix(in srgb, var(--kt-queue) 50%, transparent); stroke-width: 1.5; fill: color-mix(in srgb, var(--kt-queue) 9%, var(--card)); }
.kt-node.is-queued .kt-node-sub { fill: var(--kt-queue); }
.kt-node-ants { fill: none; stroke: var(--kt-queue); stroke-width: 3; stroke-dasharray: 10 8; animation: kt-ants .9s linear infinite; }
.kt-node.is-stalled .kt-node-body { stroke: var(--kt-warn); stroke-width: 3.5; fill: color-mix(in srgb, var(--kt-warn) 10%, var(--card)); }
.kt-node.is-stalled .kt-node-sub { fill: var(--kt-warn); font-weight: 800; }
.kt-node-hatch { pointer-events: none; }
.kt-hatch-line { fill: color-mix(in srgb, var(--kt-warn) 15%, transparent); }
.kt-node.is-awaiting_approval .kt-node-body { stroke: var(--kt-approve); stroke-width: 3.5; fill: color-mix(in srgb, var(--kt-approve) 13%, var(--card)); }
.kt-node.is-awaiting_approval .kt-node-sub { fill: var(--kt-approve); font-weight: 800; }
.kt-node.is-awaiting_approval .kt-node-halo { stroke: var(--kt-approve); animation: kt-beacon 1.1s ease-in-out infinite; }
.kt-node.is-failed .kt-node-body { fill: var(--kt-bad-solid); stroke: var(--kt-bad); stroke-width: 3; }
.kt-node.is-failed :is(.kt-node-title, .kt-node-sub) { fill: #fff; }
.kt-node.is-failed .kt-node-avatar { fill: color-mix(in srgb, #fff 18%, transparent); stroke: none; }
.kt-node.is-done .kt-node-body { stroke: var(--kt-ok); stroke-width: 3; fill: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); }
.kt-node.is-done .kt-node-sub { fill: var(--kt-ok); }
.kt-node:is(.is-merged, .is-final) .kt-node-body { fill: var(--kt-ok-solid); stroke: color-mix(in srgb, var(--kt-ok) 70%, #fff); stroke-width: 1.5; }
.kt-node:is(.is-merged, .is-final) .kt-node-title { fill: #fff; }
.kt-node:is(.is-merged, .is-final) .kt-node-sub { fill: #fff; opacity: .85; }
.kt-node:is(.is-merged, .is-final) .kt-node-avatar { fill: color-mix(in srgb, #fff 17%, transparent); stroke: color-mix(in srgb, #fff 30%, transparent); }
.kt-node-check circle { fill: #fff; }
.kt-node-check path { fill: none; stroke: var(--kt-ok-solid); stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }
.kt-node-retry { cursor: pointer; }
.kt-node-retry rect { fill: var(--kt-bad-solid); stroke: color-mix(in srgb, #fff 40%, transparent); stroke-width: 1; }
.kt-node-retry text { fill: #fff; font-size: 12.5px; font-weight: 800; }
.kt-node-retry:hover rect, .kt-node-retry:focus-visible rect { filter: brightness(1.15); stroke: #fff; stroke-width: 2; }
.kt-retry-btn { margin-left: 8px; }
.kt-node-badge rect { fill: var(--kt-badge, var(--muted)); }
.kt-node-badge text { fill: var(--kt-on); font-size: 12px; font-weight: 800; }
.kt-node-badge.is-fix { --kt-badge: var(--kt-fix); }
.kt-node-badge.is-bad { --kt-badge: var(--kt-bad); }
.kt-node-badge.is-queue { --kt-badge: var(--kt-queue); }
.kt-node-badge.is-warn { --kt-badge: var(--kt-warn); }
.kt-node-badge.is-approve { --kt-badge: var(--kt-approve); }
.kt-node-badge.is-gate { --kt-badge: var(--kt-approve); }
.kt-node-flash { stroke-width: 6; opacity: 0; transform-box: fill-box; transform-origin: center; pointer-events: none; animation: kt-flash 1.4s ease-out 1 forwards; }
.kt-node-flash.is-bad { stroke: var(--kt-bad); fill: color-mix(in srgb, var(--kt-bad) 30%, transparent); }
.kt-node-flash.is-ok { stroke: var(--kt-ok); fill: color-mix(in srgb, var(--kt-ok) 25%, transparent); }

.kt-rail-base { stroke: color-mix(in srgb, var(--muted) 45%, transparent); stroke-width: 6; stroke-linecap: round; stroke-dasharray: 1 9; }
.kt-rail-fill { stroke: var(--kt-ok); stroke-width: 6; stroke-linecap: round; filter: drop-shadow(0 0 5px color-mix(in srgb, var(--kt-ok) 60%, transparent)); transition: x2 .8s; }
.kt-rail-label { fill: var(--text-strong); font-size: 14.5px; font-weight: 800; }
.kt-rail-sub { fill: var(--muted); font-size: 13px; font-weight: 600; }
.kt-rail-label .kt-mono, .kt-rail-sub .kt-mono { font-weight: 500; fill: var(--muted); }
.kt-rail-dot circle { fill: var(--kt-ok-solid); stroke: var(--card); stroke-width: 2.5; }
.kt-rail-dot text { fill: #fff; font-size: 11px; font-weight: 800; }
.kt-rail-dot.is-conflict circle { fill: var(--kt-bad-solid); stroke: var(--kt-bad); }
.kt-rail-dot.is-dim { opacity: .3; }
.kt-rail-flash { fill: none; stroke-width: 4; transform-box: fill-box; transform-origin: center; animation: kt-flash 1.4s ease-out 1 forwards; }
.kt-rail-flash.is-bad { stroke: var(--kt-bad); }
.kt-rail-flash.is-ok { stroke: var(--kt-ok); }
.kt-station-bg { fill: var(--bg-elevated, var(--card)); stroke: var(--border-strong, var(--muted)); stroke-width: 2.5; transition: fill .5s, stroke .5s; }
.kt-station-track { fill: none; stroke: color-mix(in srgb, var(--muted) 28%, transparent); stroke-width: 6; }
.kt-station-pass { fill: none; stroke: var(--kt-ok); stroke-width: 6; transition: stroke-dasharray .8s; }
.kt-station-fail { fill: none; stroke: var(--kt-bad); stroke-width: 6; transition: stroke-dasharray .8s, stroke-dashoffset .8s; }
.kt-station-num { fill: var(--text-strong); font-size: 15px; font-weight: 850; font-variant-numeric: tabular-nums; }
.kt-station-label { fill: var(--text-strong); font-size: 13.5px; font-weight: 800; }
.kt-station.is-pass .kt-station-bg { fill: color-mix(in srgb, var(--kt-ok) 16%, var(--card)); stroke: var(--kt-ok); }
.kt-station.is-fail .kt-station-bg { stroke: color-mix(in srgb, var(--kt-bad) 70%, transparent); }
.kt-station-flash { fill: none; stroke-width: 6; transform-box: fill-box; transform-origin: center; animation: kt-flash 1.6s ease-out 1 forwards; }
.kt-station-flash.is-ok { stroke: var(--kt-ok); fill: color-mix(in srgb, var(--kt-ok) 22%, transparent); }
.kt-station-flash.is-bad { stroke: var(--kt-bad); }

.kt-particles { pointer-events: none; }
.kt-p { color: var(--kt-info); }
.kt-p.is-handoff { color: var(--kt-handoff); }
.kt-p:is(.is-merge, .is-pass, .is-ok) { color: var(--kt-ok); }
.kt-p:is(.is-fail, .is-bounce, .is-danger) { color: var(--kt-bad); }
.kt-p:is(.is-run, .is-tool) { color: var(--kt-run); }
.kt-p-halo { fill: currentColor; opacity: .22; }
.kt-p-tail-glow { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; opacity: .16; }
.kt-p-tail { fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; opacity: .62; }
.kt-p-head { fill: color-mix(in srgb, currentColor 40%, #fff); stroke: currentColor; stroke-width: 2.2; }
.kt-p-ring { fill: none; stroke: currentColor; }
.kt-p.is-tool .kt-p-ring { opacity: .7; }
.kt-p-cross, .kt-p-check { fill: none; stroke: currentColor; stroke-width: 3.2; stroke-linecap: round; stroke-linejoin: round; }
.kt-p-label { fill: currentColor; font-size: 13px; font-weight: 800; paint-order: stroke; stroke: var(--card); stroke-width: 4px; stroke-linejoin: round; }

.kt-legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; padding: 8px 16px 10px; font-size: 12px; color: var(--muted);
  border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent); background: color-mix(in srgb, var(--bg) 35%, transparent); }
.kt-legend-item { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.kt-legend-item i { width: 18px; height: 11px; border-radius: 4px; border: 2px solid var(--border-strong, var(--muted)); }
${Object.entries({
	waiting: "idle",
	queued: "queue",
	running: "run",
	stalled: "warn",
	awaiting_approval: "approve",
	done: "done",
	merged: "ok",
	fixing: "fix",
	failed: "bad"
}).map(([e, t]) => `.kt-legend-item.is-${e} i { border-color: var(--kt-${t}); background: color-mix(in srgb, var(--kt-${t}) 16%, transparent); }`).join("\n")}
.kt-legend-item.is-waiting i { border-style: dashed; background: none; }
.kt-legend-item.is-skipped i { border-style: dotted; background: none; opacity: .6; }
.kt-legend-item.is-queued i { border-style: dashed; }
.kt-legend-item.is-merged i, .kt-legend-item.is-failed i { background: var(--kt-ok-solid); }
.kt-legend-item.is-failed i { background: var(--kt-bad-solid); }
.kt-legend-item b { width: 9px; height: 9px; border-radius: 50%; background: var(--kt-info); box-shadow: 0 0 8px currentColor; }
.kt-legend-item.is-p-handoff b { background: var(--kt-handoff); color: var(--kt-handoff); }
.kt-legend-item:is(.is-p-merge, .is-p-pass) b { background: var(--kt-ok); color: var(--kt-ok); }
.kt-legend-item.is-p-fail b { background: var(--kt-bad); color: var(--kt-bad); }
.kt-legend-sep { width: 1px; height: 14px; background: var(--border); }
.kt-legend-note { margin-left: auto; font-style: italic; }

/* ---------- cards: conveyor, wall, feed ---------- */
.kt-card { min-width: 0; } /* frame: kit.ts */
.kt-card-head { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; margin-bottom: 10px; }

.kt-belt { list-style: none; margin: 0; padding: 4px 2px 6px; display: flex; align-items: center; gap: 10px; overflow-x: auto; position: relative; scrollbar-width: thin; scroll-behavior: smooth; }
.kt-belt::before { content: ''; position: absolute; left: 8px; right: 8px; top: 50%; height: 4px; margin-top: -2px; border-radius: 2px;
  background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--muted) 38%, transparent) 0 10px, transparent 10px 17px); }
.kt-belt > li { position: relative; z-index: 1; flex: none; }
.kt-belt.has-older { -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 56px); mask-image: linear-gradient(90deg, transparent 0, #000 56px); }
.kt-belt-end { display: flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 10px; font-size: .86em; font-weight: 750; border: 1px solid var(--border-strong, var(--border)); background: var(--bg-elevated, var(--card)); color: var(--muted); }
.kt-belt-end.is-head { margin-left: auto; color: var(--kt-ok); border-color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 10%, var(--card)); box-shadow: 0 0 20px -6px var(--kt-ok); }
.kt-belt-chip { display: flex; flex-direction: column; gap: 1px; padding: 5px 11px 6px; border-radius: 12px; transition: opacity .3s;
  border: 1px solid color-mix(in srgb, var(--kt-ok) 50%, var(--border)); background: color-mix(in srgb, var(--kt-ok) 10%, var(--card)); }
.kt-belt-chip.is-conflict { border: 2px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 14%, var(--card)); }
.kt-belt-chip.is-pending { border: 1px dashed var(--border-strong, var(--muted)); background: var(--card); }
.kt-belt-chip.is-new { animation: kt-slide-in 1s cubic-bezier(.2,.8,.2,1) 1; }
.kt-belt-chip.is-dim { opacity: .3; }
.kt-belt-role { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-weight: 800; color: var(--text-strong); cursor: pointer; text-align: left; white-space: nowrap; }
.kt-belt-meta { font-size: .78em; color: var(--muted); white-space: nowrap; }
.kt-belt-meta code { color: var(--text); }
.kt-belt-note { font-size: .82em; font-weight: 800; color: var(--kt-bad); white-space: nowrap; }

.kt-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(360px, 400px); gap: 14px; align-items: start; }
.kt-col { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.kt-side { position: sticky; top: 12px; display: flex; flex-direction: column; gap: 14px; min-width: 0; max-height: calc(100vh - 24px); overflow-y: auto; scrollbar-width: thin; }
.kt-side .kt-feed { display: flex; flex-direction: column; flex: 1 1 auto; min-height: 240px; }
.kt-side .kt-feed-list { flex: 1 1 auto; min-height: 0; max-height: none; }
/* narrower than 1600px (a laptop): the side column goes under the graph, so the team graph gets the whole width */
@media (max-width: 1600px) { .kt-body { grid-template-columns: minmax(0, 1fr); } .kt-side { position: static; max-height: none; } .kt-side .kt-feed-list { max-height: 460px; } }

.kt-wall-score { font-size: 1.4em; font-weight: 850; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.kt-wall-cmd { padding: 1px 7px; border-radius: 6px; font-size: .8em; color: var(--muted); background: color-mix(in srgb, var(--text) 6%, transparent); }
.kt-wall-at { font-size: .8em; }

.kt-wall-empty { margin: 4px 0; }
.kt-spark-row { display: grid; grid-template-columns: auto minmax(0, 1fr); align-items: center; gap: 10px; margin: -2px 0 10px; font-size: .78em; color: var(--muted); }
.kt-spark { display: block; width: 100%; height: 40px; overflow: visible; }
.kt-spark-total { stroke: var(--border-strong, var(--muted)); stroke-dasharray: 3 3; }
.kt-spark-area { fill: color-mix(in srgb, var(--kt-ok) 20%, transparent); }
.kt-spark-line { fill: none; stroke: var(--kt-ok); stroke-width: 2; stroke-linejoin: round; }
.kt-spark-pt.is-pass { fill: var(--kt-ok); } .kt-spark-pt.is-fail { fill: var(--kt-bad); }
.kt-spark-label { fill: var(--text-strong); font-size: 10px; font-weight: 800; }
.kt-wall-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.kt-ac { display: flex; flex-direction: column; gap: 3px; }
.kt-ac-label { padding-left: 3px; font-size: .74em; font-weight: 800; color: var(--muted); }
.kt-group-label { padding-left: 3px; font-size: .82em; font-weight: 900; letter-spacing: .04em; color: var(--text-strong); }
.kt-ac-cells { display: flex; gap: 4px; }
.kt-ac.is-multi .kt-ac-cells { padding: 3px; border-radius: 13px; border: 1px dashed var(--border-strong, var(--border)); }
.kt-cell { position: relative; width: 54px; height: 54px; padding: 0; border: 0; border-radius: 12px; background: none; font: inherit; cursor: pointer; perspective: 320px; transition: opacity .3s; }
.kt-cell.is-pass { --kt-c: var(--kt-ok); } .kt-cell.is-fail { --kt-c: var(--kt-bad); } .kt-cell.is-skip { --kt-c: var(--muted); }
.kt-cell-face { position: absolute; inset: 0; display: grid; grid-template-rows: auto 1fr; padding: 4px 6px; border-radius: 12px; text-align: left;
  border: 2px solid var(--kt-c); background: color-mix(in srgb, var(--kt-c) 15%, var(--card)); color: var(--text-strong); transform-origin: 50% 50%; backface-visibility: hidden; }
.kt-cell.is-pass .kt-cell-face { background: var(--kt-ok-solid); border-color: color-mix(in srgb, var(--kt-ok) 75%, transparent); color: #fff; }
.kt-cell.is-skip .kt-cell-face { border-style: dashed; color: var(--muted); }
.kt-cell-ac { font-size: .72em; font-weight: 850; white-space: nowrap; }
.kt-cell-glyph { align-self: center; justify-self: center; margin-top: -4px; font-size: 1.4em; font-weight: 900; line-height: 1; }
.kt-cell.is-fail .kt-cell-glyph { color: var(--kt-bad); }
.kt-cell-owner { position: absolute; right: 3px; bottom: 1px; font-size: 13px; }
.kt-cell-face.is-flip { animation: kt-flip .85s cubic-bezier(.2,.8,.25,1) 1, kt-burst 1.3s ease-out 1; }
.kt-cell:hover .kt-cell-face, .kt-cell:focus-visible .kt-cell-face { box-shadow: 0 0 0 2px var(--accent); }
.kt-cell.is-dim { opacity: .28; }
.kt-cell.is-hot .kt-cell-face { box-shadow: 0 0 0 2px var(--accent); }
.kt-wall-inspect { display: flex; flex-wrap: wrap; align-items: baseline; gap: 3px 10px; min-height: 2.6em; margin-top: 10px; padding: 7px 10px; border-radius: 10px; font-size: .86em; background: color-mix(in srgb, var(--text) 4.5%, transparent); }
.kt-wall-inspect.is-fail { background: color-mix(in srgb, var(--kt-bad) 9%, transparent); }
.kt-wall-inspect strong { color: var(--text-strong); }
.kt-fail-msg { color: var(--kt-bad); font-weight: 750; }
.kt-inspect-owner { margin-left: 8px; }

.kt-feed-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; max-height: 460px; overflow-y: auto; scrollbar-width: thin; }
.kt-ev { display: grid; grid-template-columns: 1.6em minmax(0, 1fr) auto auto; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 8px; font-size: .88em; }
.kt-ev:hover { background: color-mix(in srgb, var(--text) 5%, transparent); }
.kt-ev-icon { text-align: center; }
.kt-ev-text { min-width: 0; overflow-wrap: anywhere; color: var(--text); }
.kt-ev.is-tool .kt-ev-text { color: var(--muted); }
.kt-ev.tone-bad .kt-ev-text { color: var(--kt-bad); font-weight: 750; }
.kt-ev.is-merged .kt-ev-text, .kt-ev.is-done .kt-ev-text { color: var(--kt-ok); }
.kt-ev.is-handoff .kt-ev-text { color: var(--kt-handoff); }
.kt-ev.is-new { animation: kt-ev-in 1.6s ease-out 1; }
.kt-ev-roles { display: inline-flex; align-items: center; gap: 2px; color: var(--muted); font-size: .9em; }
.kt-ev-role { appearance: none; padding: 0 4px; border-radius: 7px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); font-size: 13px; line-height: 1.5; cursor: pointer; }
.kt-ev-role:hover { border-color: var(--accent); }
.kt-ev-time { color: var(--muted); font-size: .84em; white-space: nowrap; font-variant-numeric: tabular-nums; }
.kt-feed-empty { padding: 8px 6px; }
.kt-filter { appearance: none; font: inherit; font-size: .82em; font-weight: 700; padding: 2px 10px; border-radius: 999px; cursor: pointer; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--text-strong); }
.kt-check { margin-left: auto; display: inline-flex; align-items: center; gap: 4px; font-size: .82em; color: var(--muted); cursor: pointer; }

/* ---------- lanes ---------- */
.kt-lanes { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.kt-lane { position: relative; display: grid; grid-template-columns: 236px minmax(0, 1.2fr) minmax(0, 1fr); grid-template-areas: "id live work" "id track track";
  gap: 6px 16px; padding: 12px 14px 10px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--card); overflow: hidden;
  transition: opacity .3s, box-shadow .3s, border-color .3s; scroll-margin: 16px; }
.kt-lane::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--kt-tone); }
.kt-lane.is-compact { grid-template-areas: "id live live" "id track track"; }
.kt-lane:is(.is-running, .is-fixing) { border-color: color-mix(in srgb, var(--kt-tone) 55%, var(--border));
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--kt-tone) 30%, transparent), 0 10px 30px -16px var(--kt-tone);
  background: linear-gradient(100deg, color-mix(in srgb, var(--kt-tone) 8%, var(--card)), var(--card) 45%); }
.kt-lane:is(.is-merged, .tone-ok) { background: linear-gradient(100deg, color-mix(in srgb, var(--kt-ok) 6%, var(--card)), var(--card) 40%); }
.kt-lane:is(.is-stalled, .is-awaiting_approval, .is-failed) { border-color: var(--kt-tone); box-shadow: 0 0 0 1px var(--kt-tone); }
.kt-lane.is-stalled { background-image: repeating-linear-gradient(135deg, color-mix(in srgb, var(--kt-warn) 7%, transparent) 0 10px, transparent 10px 20px); }
.kt-lane.is-waiting { background: color-mix(in srgb, var(--card) 70%, transparent); border-style: dashed; }
.kt-lane.is-dim { opacity: .42; }
.kt-lane.is-focus { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); }
.kt-lane.is-followed { font-size: 1.07em; border-color: var(--kt-tone); box-shadow: 0 0 0 2px var(--kt-tone), 0 16px 44px -16px var(--kt-tone); }
.kt-lane.is-followed::after { content: '跟随中'; position: absolute; top: 8px; right: 10px; padding: 1px 8px; border-radius: 999px; font-size: .72em; font-weight: 800; background: var(--kt-tone); color: var(--kt-on); }
.kt-lane-bump { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; animation: kt-bump 1.8s ease-out 1 forwards; }
.kt-lane-axis { padding: 0 14px 0 18px; border: 0; background: none; box-shadow: none; }
.kt-lane-axis::before { display: none; }
.kt-axis-title { grid-area: id; align-self: end; font-size: .76em; color: var(--muted); white-space: nowrap; }
.kt-axis { grid-area: track; position: relative; height: 16px; }
.kt-axis-tick { position: absolute; top: 0; transform: translateX(-50%); font-size: .76em; color: var(--muted); font-variant-numeric: tabular-nums; }
.kt-axis-tick:first-child { transform: none; }
.kt-axis-tick:last-child { transform: translateX(-100%); }
.kt-lane-id { grid-area: id; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 4px 10px; align-content: start; }
.kt-avatar { width: 52px; height: 52px; padding: 0; display: grid; place-items: center; border-radius: 16px; font-size: 27px; cursor: pointer;
  border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 13%, var(--card)); transition: box-shadow .3s; }
.kt-lane.is-waiting .kt-avatar span { filter: grayscale(1); opacity: .55; }
.kt-lane:is(.is-merged, .tone-ok) .kt-avatar { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); }
.kt-lane:is(.is-running, .is-fixing) .kt-avatar { animation: kt-glow 2.4s ease-in-out infinite; }
.kt-lane-who { display: flex; flex-direction: column; justify-content: center; gap: 5px; min-width: 0; }
.kt-lane-name { display: flex; align-items: center; gap: 6px; font-size: 1.18em; line-height: 1.2; font-weight: 850; color: var(--text-strong); }
.kt-lane-doing { font-size: 12px; color: var(--muted); margin: 1px 0 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kt-lane-doing.is-sent-back { color: var(--kt-fix); font-weight: 650; }
.kt-lane-tag { display: flex; align-items: center; gap: 6px; min-width: 0; }
.kt-lane-model { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .74em; color: var(--muted); }
.kt-lane-stats { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 1px 10px; margin: 6px 0 0; font-size: .82em; color: var(--muted); font-variant-numeric: tabular-nums; }
.kt-lane-stats b { font-weight: 750; color: var(--text); }
.kt-lane-live { grid-area: live; display: flex; flex-direction: column; gap: 7px; min-width: 0; }
.kt-lane-work { grid-area: work; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.kt-situation { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; padding: 6px 10px; border-radius: 10px; font-size: .93em;
  border: 1px solid color-mix(in srgb, var(--kt-tone) 42%, transparent); background: color-mix(in srgb, var(--kt-tone) 10%, transparent); color: var(--text); }
.kt-situation strong { color: var(--kt-tone); font-weight: 800; }
.kt-situation:is(.tone-ok, .tone-done) { padding: 0; border: 0; background: none; }
.kt-situation.tone-idle { background: none; border-style: dashed; }
.kt-situation.tone-idle strong { color: var(--text-strong); }
.kt-situation:is(.tone-warn, .tone-approve, .tone-bad) { font-weight: 600; }
.kt-summary { color: var(--text); overflow-wrap: anywhere; }
.kt-deps { display: flex; flex-wrap: wrap; gap: 6px; }
.kt-chip-role { appearance: none; font: inherit; font-size: .86em; font-weight: 650; padding: 1px 9px; border-radius: 999px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--kt-tone) 48%, transparent); background: color-mix(in srgb, var(--kt-tone) 11%, transparent); color: var(--kt-tone); }
.kt-violation { padding: 6px 10px; border-radius: 10px; font-size: .93em; font-weight: 800; color: var(--kt-bad);
  border: 1px solid color-mix(in srgb, var(--kt-bad) 60%, transparent); background: color-mix(in srgb, var(--kt-bad) 13%, transparent); }
.kt-ticker { display: flex; align-items: center; gap: 6px; min-width: 0; font-weight: 700; color: var(--kt-tone); }
.kt-ticker-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; animation: kt-tick-in .45s ease-out 1; }
.kt-caret { display: inline-block; flex: none; width: .5em; height: 1.05em; margin-left: 2px; vertical-align: -.15em; background: currentColor; animation: kt-caret 1s steps(1) infinite; }
.kt-tail { margin: 0; display: flex; flex-direction: column; justify-content: flex-end; max-height: 4.9em; overflow: hidden; padding: 6px 10px; font-size: .92em; line-height: 1.55; color: var(--text);
  border-left: 3px solid color-mix(in srgb, var(--kt-tone) 65%, transparent); border-radius: 0 10px 10px 0; background: color-mix(in srgb, var(--text) 4%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 1.5em); mask-image: linear-gradient(to bottom, transparent 0, #000 1.5em); }
.kt-tail.is-fresh { animation: kt-fade-in .8s ease-out 1; }
.kt-lane.is-followed .kt-tail { max-height: 8em; }
.kt-tools { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; font-size: .8em; }
.kt-tools li { display: inline-flex; align-items: center; gap: 5px; max-width: 220px; padding: 2px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--kt-glass); color: var(--muted); }
.kt-tools li .kt-mono { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.kt-tools li time { font-size: .92em; white-space: nowrap; }
.kt-tools li.is-last { border-color: color-mix(in srgb, var(--kt-tone) 60%, transparent); background: color-mix(in srgb, var(--kt-tone) 12%, transparent); }
.kt-files-head { display: flex; align-items: baseline; gap: 8px; font-size: .84em; font-weight: 750; color: var(--text-strong); }
.kt-add { color: var(--kt-ok); font-weight: 750; } .kt-del { color: var(--kt-bad); font-weight: 750; }
.kt-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 3px; font-size: .8em; }
.kt-files li { display: grid; grid-template-columns: 1.3em minmax(0, 1fr) 64px 5.6em; align-items: center; gap: 6px; }
.kt-file-st { text-align: center; font-family: var(--mono, monospace); font-weight: 850; }
.kt-file-st.is-A { color: var(--kt-ok); } .kt-file-st.is-M { color: var(--kt-warn); } .kt-file-st.is-D { color: var(--kt-bad); }
.kt-file-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text); }
.kt-file-bar { display: flex; height: 7px; border-radius: 4px; overflow: hidden; background: color-mix(in srgb, var(--muted) 15%, transparent); }
.kt-bar-add { background: var(--kt-ok); } .kt-bar-del { background: var(--kt-bad); }
.kt-file-num { text-align: right; white-space: nowrap; }
.kt-files li.is-violation .kt-file-path { color: var(--kt-bad); font-weight: 800; text-decoration: underline wavy color-mix(in srgb, var(--kt-bad) 70%, transparent); text-underline-offset: 3px; }
.kt-files li.is-violation .kt-file-st { color: var(--kt-bad); }
.kt-files li.kt-more { display: block; font-size: .95em; }
.kt-commits { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; font-size: .8em; }
.kt-commits li { display: flex; gap: 6px; min-width: 0; }
.kt-commits code { flex: none; color: var(--kt-handoff); }
.kt-commits span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-owned { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; font-size: .78em; }
.kt-owned-case { padding: 1px 7px; border-radius: 6px; font-weight: 800; font-family: var(--mono, monospace); }
.kt-owned-case sub { font-size: .72em; margin-left: 2px; opacity: .75; vertical-align: baseline; }
.kt-owned-case.is-pass { color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 13%, transparent); }
.kt-owned-case.is-fail { color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 13%, transparent); }
.kt-owned-case.is-skip { color: var(--muted); background: var(--kt-glass); }
.kt-nothing { margin: 0; font-size: .84em; }
.kt-track { grid-area: track; position: relative; height: 14px; margin-top: 2px; }
.kt-track-line { position: absolute; left: 0; right: 0; top: 6px; height: 2px; border-radius: 1px; background: color-mix(in srgb, var(--muted) 22%, transparent); }
.kt-track-span { position: absolute; top: 3px; height: 8px; border-radius: 4px; background: color-mix(in srgb, var(--text) 34%, transparent); }
.kt-track-span.is-fix { background: color-mix(in srgb, var(--kt-fix) 65%, transparent); }
.kt-track-span.is-live { background: var(--kt-tone); box-shadow: 0 0 10px color-mix(in srgb, var(--kt-tone) 70%, transparent); }
.kt-track-span.is-live::after { content: ''; position: absolute; right: -3px; top: -3px; width: 14px; height: 14px; border-radius: 50%; background: var(--kt-tone); box-shadow: 0 0 10px var(--kt-tone); animation: kt-blink 1.4s ease-in-out infinite; }
.kt-track-mark { position: absolute; top: 0; width: 4px; height: 14px; margin-left: -2px; border-radius: 2px; background: var(--muted); }
.kt-track-mark.is-commit { top: 4px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--text-strong); box-shadow: 0 0 0 2px var(--card); }
.kt-track-mark.is-merged { background: var(--kt-ok); }
.kt-track-mark:is(.is-conflict, .is-bounce, .is-violation) { background: var(--kt-bad); }

/* ---------- the empty state and the probe ---------- */
.kt-empty { display: grid; gap: 22px; padding: 28px 30px; border-radius: 22px; border: 1px solid var(--border);
  background: radial-gradient(90% 90% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--card); }
.kt-empty-hero h2 { margin: 0 0 8px; font-size: 2.1em; font-weight: 850; color: var(--text-strong); letter-spacing: -.01em; }
.kt-empty-hero p { margin: 0; max-width: 62em; color: var(--text); font-size: 1.04em; line-height: 1.65; }
.kt-team-intro { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 22px; align-items: center; }
@media (max-width: 1000px) { .kt-team-intro { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.kt-team-intro.is-phased { grid-template-columns: 1.15fr 1.15fr 1.6fr .8fr; align-items: stretch; gap: 14px; }
@media (max-width: 1000px) { .kt-team-intro.is-phased { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.kt-intro-phase { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 16px; border: 1px dashed color-mix(in srgb, var(--muted) 35%, transparent); }
.kt-intro-phase-head { display: flex; flex-direction: column; gap: 2px; }
.kt-intro-phase-head b { color: var(--text-strong); font-size: 1.02em; }
.kt-intro-phase-head span { color: var(--muted); font-size: .86em; }
.kt-intro-phase-body { display: flex; gap: 10px; align-items: center; flex: 1; }
.kt-intro-phase-body > .kt-intro-stage { flex: 1; min-width: 0; }
.kt-intro-stage { position: relative; display: flex; flex-direction: column; gap: 8px; }
.kt-intro-stage:not(:last-child)::after { content: '→'; position: absolute; right: -18px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.2em; }
.kt-intro-role { display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 8px; padding: 9px 11px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }
.kt-empty-punch { margin-top: 10px; font-size: 1.12em; font-weight: 850; color: var(--text-strong); }
.kt-intro-emoji { grid-row: span 2; align-self: center; color: var(--text-strong); opacity: .85; }
.kt-role-icon { display: inline-block; vertical-align: -0.18em; flex: none; }
.kt-start-row { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; }
.kt-start-field { display: flex; flex-direction: column; gap: 4px; flex: 1 1 360px; font-size: .9em; }
.kt-start-field span { font-weight: 750; color: var(--text-strong); }
.kt-start-field.is-narrow { flex: 0 1 260px; }
.kt-start-field input, .kt-start-field select { font: inherit; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); color: var(--text); font-weight: 400; }
.kt-start-field input::placeholder, .kt-start textarea::placeholder { color: var(--muted); font-weight: 400; }
.kt-intro-role b { color: var(--text-strong); }
.kt-intro-does { font-size: .82em; color: var(--muted); }
.kt-intro-name { display: flex; align-items: baseline; gap: 4px; min-width: 0; }
.kt-intro-agent { font-size: 11px; font-weight: 600; color: var(--muted); }
.kt-intro-par { align-self: flex-start; padding: 1px 9px; border-radius: 999px; font-size: .74em; font-weight: 850; color: var(--kt-run); background: color-mix(in srgb, var(--kt-run) 13%, transparent); border: 1px solid color-mix(in srgb, var(--kt-run) 40%, transparent); }
.kt-debug summary { cursor: pointer; font-size: .84em; color: var(--muted); }
.kt-debug pre { max-height: 320px; overflow: auto; margin: 8px 0 0; padding: 10px 12px; border-radius: 10px; font-size: 12px; background: var(--bg-elevated, var(--card)); border: 1px solid var(--border); }

/* ---------- projection ---------- */
.kt-root.is-projection { position: fixed; inset: 0; z-index: 2147483000; height: 100vh; overflow: hidden; background: var(--bg); font-size: 16.5px; padding: 16px 26px 18px; gap: 12px; }
.kt-root.is-projection .kt-body { flex: 1 1 auto; min-height: 0; grid-template-columns: minmax(0, 1fr) minmax(400px, 470px); align-items: stretch; }
.kt-root.is-projection .kt-col { min-height: 0; overflow: hidden; }
.kt-root.is-projection .kt-col > :not(.kt-lanes) { flex: none; }
.kt-root.is-projection > :not(.kt-body) { flex: none; }
.kt-root.is-projection .kt-graph-svg { max-height: 44vh; }
.kt-root.is-projection .kt-graph.is-phased .kt-graph-svg { max-height: 72vh; }
.kt-root.is-projection .kt-body:has(.kt-graph.is-phased) { grid-template-columns: minmax(0, 1fr) minmax(260px, 300px); }
.kt-root.is-projection .kt-lanes { flex: 1 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: thin; padding-right: 4px; }
.kt-root.is-projection .kt-lane { flex: none; }
.kt-root.is-projection .kt-side { position: static; max-height: none; min-height: 0; height: 100%; }
.kt-root.is-projection .kt-lane:is(.is-merged, .is-waiting):not(.is-followed):not(.is-focus) { grid-template-areas: "id live live" "id track track"; padding-top: 8px; padding-bottom: 6px; }
.kt-root.is-projection .kt-lane:is(.is-merged, .is-waiting):not(.is-followed):not(.is-focus) :is(.kt-lane-work, .kt-lane-stats, .kt-lane-model, .kt-deps) { display: none; }
.kt-root.is-projection .kt-lane:is(.is-merged, .is-waiting):not(.is-followed):not(.is-focus) .kt-avatar { width: 40px; height: 40px; font-size: 21px; border-radius: 12px; }
.kt-root.is-projection .kt-lane:is(.is-merged, .is-waiting):not(.is-followed):not(.is-focus) .kt-lane-id { grid-template-columns: 40px minmax(0, 1fr); }
.kt-root:fullscreen { background: var(--bg); }

/* ---------- 产出: each step's deliverables ---------- */
.kt-grow { flex: 1 1 auto; }
.kt-folder { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.kt-folder-path { padding: 4px 8px; border-radius: 8px; background: var(--kt-glass); border: 1px solid var(--border); overflow-wrap: anywhere; user-select: all; }
.kt-folder-acts { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.kt-folder-panel { display: grid; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); }
.kt-folder-panel-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.kt-pane-folder { margin-top: 2px; font-size: .9em; }
.kt-pad { padding: 12px 14px; margin: 0; }
.kt-btn.is-small { padding: 4px 10px; font-size: .84em; border-radius: 8px; }
.kt-seg { display: inline-flex; gap: 4px; }
.kt-out-btn { grid-column: 1 / -1; justify-self: start; appearance: none; border: 0; background: none; padding: 2px 0 0; font: inherit; font-size: .84em; font-weight: 750; color: var(--accent); cursor: pointer; }
.kt-out-btn:hover { text-decoration: underline; }
.kt-file-open { appearance: none; border: 0; background: none; padding: 0; font: inherit; text-align: left; cursor: pointer; }
.kt-file-open:hover { color: var(--accent); text-decoration: underline; }
.kt-drawer-backdrop { position: fixed; inset: 0; z-index: 80; display: flex; justify-content: flex-end; background: color-mix(in srgb, #05030a 46%, transparent); animation: kt-fade-in .16s ease-out; }
.kt-drawer { width: min(1240px, 96vw); height: 100%; display: flex; flex-direction: column; min-height: 0; background: var(--bg, var(--card)); color: var(--text);
  border-left: 1px solid var(--border-strong, var(--border)); box-shadow: -30px 0 80px rgba(0, 0, 0, .38); }
.kt-drawer-top { display: flex; align-items: center; gap: 10px; padding: 14px 20px 10px; }
.kt-drawer-top h2 { margin: 0; font-size: 1.12em; color: var(--text-strong); }
.kt-steps { display: flex; gap: 6px; padding: 4px 20px 12px; overflow-x: auto; border-bottom: 1px solid var(--border); }
.kt-step { appearance: none; display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px 5px 6px; border-radius: 999px; cursor: pointer; white-space: nowrap; font: inherit; font-size: .9em; font-weight: 700;
  border: 1px solid color-mix(in srgb, var(--kt-tone, var(--border)) 45%, var(--border)); background: color-mix(in srgb, var(--kt-tone, var(--muted)) 8%, var(--card)); color: var(--text); }
.kt-step-n { display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; font-size: .78em; background: color-mix(in srgb, var(--kt-tone, var(--muted)) 30%, transparent); color: var(--text-strong); }
.kt-step.is-product { padding-left: 12px; }
.kt-step.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 22%, var(--card)); color: var(--text-strong); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); }
.kt-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
.kt-pane-head { padding: 12px 20px 0; display: grid; gap: 6px; }
.kt-pane-who { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kt-pane-who h3 { margin: 0; font-size: 1.2em; color: var(--text-strong); }
.kt-pane-emoji { color: var(--text-strong); }
.kt-pane-scope { margin: 0; font-size: .86em; }
.kt-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-top: 4px; }
.kt-tab { appearance: none; border: 0; background: none; padding: 9px 14px; margin-bottom: -1px; font: inherit; font-weight: 750; color: var(--muted); cursor: pointer; border-bottom: 2px solid transparent; }
.kt-tab sub { font-size: .72em; margin-left: 3px; vertical-align: baseline; opacity: .8; }
.kt-tab[aria-selected="true"] { color: var(--text-strong); border-bottom-color: var(--accent); }
.kt-tab:hover { color: var(--text-strong); }
.kt-pane-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 14px 20px 26px; }
.kt-files-pane { display: grid; grid-template-columns: minmax(220px, 310px) minmax(0, 1fr); gap: 14px; height: 100%; min-height: 420px; }
.kt-flist { overflow: auto; min-height: 0; }
.kt-flist ul { list-style: none; margin: 0 0 12px; padding: 0; display: grid; gap: 2px; }
.kt-flist-h { margin: 4px 0 6px; font-size: .78em; font-weight: 800; letter-spacing: .04em; color: var(--muted); }
.kt-frow { appearance: none; width: 100%; display: grid; grid-template-columns: 1.3em minmax(0, 1fr) auto; gap: 6px; align-items: center; padding: 5px 8px; border-radius: 8px; border: 1px solid transparent;
  background: none; font: inherit; font-size: .86em; color: var(--text); text-align: left; cursor: pointer; }
.kt-frow:hover { background: var(--kt-glass); }
.kt-frow.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, transparent); }
.kt-frow-path { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.kt-frow-num { font-size: .92em; white-space: nowrap; }
.kt-fview { min-width: 0; min-height: 0; display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: 12px; background: var(--card); overflow: hidden; }
.kt-fview-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--border); flex-wrap: wrap; }
.kt-fview-path { font-weight: 750; color: var(--text-strong); overflow-wrap: anywhere; }
.kt-fview-body { flex: 1 1 auto; min-height: 0; overflow: auto; }
.kt-code { list-style: none; margin: 0; padding: 8px 0 12px; counter-reset: kt-ln; font-family: var(--mono, ui-monospace, monospace); font-size: 12.5px; line-height: 1.6; }
.kt-code li { counter-increment: kt-ln; display: grid; grid-template-columns: 4.4em minmax(0, 1fr); }
.kt-code li::before { content: counter(kt-ln); text-align: right; padding-right: 14px; color: var(--muted); opacity: .65; user-select: none; }
.kt-code code { white-space: pre-wrap; overflow-wrap: anywhere; font-size: 1em; padding-right: 12px; }
.kt-code.is-diff li.is-add { background: color-mix(in srgb, var(--kt-ok) 15%, transparent); }
.kt-code.is-diff li.is-add code { color: var(--text-strong); }
.kt-code.is-diff li.is-del { background: color-mix(in srgb, var(--kt-bad) 15%, transparent); }
.kt-code.is-diff li.is-hunk { color: var(--kt-info); background: color-mix(in srgb, var(--kt-info) 8%, transparent); }
.kt-code.is-diff li.is-meta { color: var(--muted); }
.kt-md { padding: 14px 18px; overflow-wrap: anywhere; }
.kt-reply { max-width: 920px; padding: 4px 2px; }
.kt-rounds { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.kt-attempt-meta { margin: 0 0 10px; font-size: .86em; }
.kt-task { margin: 0; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--card); white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12.5px; line-height: 1.6; }
.kt-calls { list-style: none; margin: 0; padding: 0; display: grid; }
.kt-calls li { display: grid; grid-template-columns: 4.2em 1.7em minmax(0, 1fr); gap: 6px; align-items: baseline; padding: 5px 2px; border-bottom: 1px dashed var(--border); font-size: .86em; }
.kt-calls li span:last-child { overflow-wrap: anywhere; }
.kt-site { display: flex; flex-direction: column; gap: 10px; height: 100%; min-height: 520px; }
.kt-site-bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.kt-site-bar a { color: var(--accent); font-weight: 750; }
.kt-site-frame { flex: 1 1 auto; width: 100%; min-height: 560px; border: 1px solid var(--border-strong, var(--border)); border-radius: 12px; background: #fff; }
.kt-site-log pre { margin: 6px 0 0; max-height: 220px; overflow: auto; padding: 10px 12px; border-radius: 10px; background: var(--card); border: 1px solid var(--border); font-size: 12px; white-space: pre-wrap; }
@media (max-width: 900px) { .kt-files-pane { grid-template-columns: minmax(0, 1fr); } }

/* ---------- motion ---------- */
@keyframes kt-halo { 0%, 100% { opacity: .1; transform: scale(.985); } 50% { opacity: .55; transform: scale(1.025); } }
@keyframes kt-spin { to { transform: rotate(360deg); } }
@keyframes kt-ants { to { stroke-dashoffset: -36; } }
@keyframes kt-beacon { 0%, 100% { opacity: .15; } 50% { opacity: .85; } }
@keyframes kt-blink { 0%, 100% { opacity: 1; } 50% { opacity: .3; } }
@keyframes kt-glow { 0%, 100% { box-shadow: 0 0 0 3px color-mix(in srgb, var(--kt-tone) 14%, transparent), 0 0 8px color-mix(in srgb, var(--kt-tone) 25%, transparent); }
  50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--kt-tone) 26%, transparent), 0 0 22px color-mix(in srgb, var(--kt-tone) 65%, transparent); } }
@keyframes kt-flash { 0% { opacity: 1; transform: scale(1); } 35% { opacity: .9; } 100% { opacity: 0; transform: scale(1.14); } }
@keyframes kt-flip { 0% { transform: rotateX(-92deg); filter: brightness(1.9); } 65% { transform: rotateX(14deg); } 100% { transform: rotateX(0); filter: none; } }
@keyframes kt-burst { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--kt-c) 80%, transparent); } 100% { box-shadow: 0 0 0 16px transparent; } }
@keyframes kt-slide-in { 0% { transform: translateX(-46px) scale(.88); opacity: 0; } 55% { opacity: 1; } 75% { transform: translateX(3px) scale(1.02); } 100% { transform: none; } }
@keyframes kt-ev-in { 0% { transform: translateY(-10px); opacity: 0; background: color-mix(in srgb, var(--accent) 28%, transparent); } 25% { transform: none; opacity: 1; } 100% { background: transparent; } }
@keyframes kt-bump { 0% { opacity: 1; box-shadow: inset 0 0 0 2px var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 16%, transparent); } 100% { opacity: 0; box-shadow: inset 0 0 0 2px var(--kt-tone); } }
@keyframes kt-pop { 0% { transform: scale(1); } 35% { transform: scale(1.22); color: var(--kt-ok); } 100% { transform: scale(1); } }
@keyframes kt-tick-in { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: none; } }
@keyframes kt-caret { 50% { opacity: 0; } }
@keyframes kt-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
@media (prefers-reduced-motion: reduce) {
  .kt-root *, .kt-root *::before, .kt-root *::after { animation: none !important; transition: none !important; }
}
.kt-root[data-motion="reduce"] *, .kt-root[data-motion="reduce"] *::before, .kt-root[data-motion="reduce"] *::after { animation: none !important; transition: none !important; }
`, ui = "--bg: #fff; --bg-hover: #f0f0f0; --card: #fff; --text: #4a464f; --text-strong: #19161d; --muted: #5e5966;\n  --border: #e4e4e7; --border-strong: #d4d4d8; --kt-approve: #b8237a; --kt-ok: #0a7d45;", di = "--s1: #2a78d6; --s2: #eb6834; --s3: #b9b6bf; --s4: #6250d6; --deemph: #b9b6bf; --cto-cell: #f7f7f8; --vs-person: #e87ba4; --vs-rework: #eda100;", fi = `
.cto-root { --s1: #3987e5; --s2: #d95926; --s3: #6b6673; --s4: #9085e9; --deemph: #6b6673; --cto-cell: var(--bg, #19161d);
  --vs-agent: var(--s4); --vs-person: #d55181; --vs-rework: #c98500;
  --cto-wash: color-mix(in srgb, var(--accent) 10%, transparent); --cto-fresh: color-mix(in srgb, var(--accent) 16%, transparent);
  --cto-glass: color-mix(in srgb, var(--text) 4%, transparent); gap: 16px; }
:root[data-mode="light"] .cto-root { ${di} }
.cto-root.is-printing { ${ui} ${di} background: #fff; color: #4a464f; }
.cto-root [hidden] { display: none !important; }
.cto-root .kt-btn.is-small { padding: 3px 10px; font-size: 13px; border-radius: 8px; }
.cto-tag { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 12px; border: 1px solid var(--border); color: var(--text); }
.cto-tag.is-real { border-color: var(--accent); color: var(--text-strong); background: var(--cto-fresh); }
.cto-dim { color: var(--muted); }

.cto-top { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.cto-top h1 { margin: 0; font-size: 15px; font-weight: 700; color: var(--text); }
.cto-top .cto-org { color: var(--text); font-size: 14px; }
.cto-grow { flex: 1; }
.cto-dl { position: relative; }
.cto-dl summary { list-style: none; }
.cto-dl summary::-webkit-details-marker { display: none; }
.cto-menu { position: absolute; right: 0; top: calc(100% + 6px); z-index: 20; min-width: 280px; padding: 6px; border-radius: 12px; border: 1px solid var(--border-strong); background: var(--card); box-shadow: 0 12px 30px rgba(0,0,0,.3); display: grid; }
.cto-menu button { text-align: left; border: 0; background: transparent; padding: 8px 10px; border-radius: 8px; cursor: pointer; font: inherit; color: var(--text); }
.cto-menu button:hover { background: var(--bg-hover); }

.cto-hero h2 { margin: 6px 0 0; font-size: 32px; line-height: 1.3; font-weight: 700; color: var(--text-strong); }
.cto-hero p { margin: 6px 0 0; color: var(--text); }
.cto-lines { display: flex; flex-wrap: wrap; gap: 8px; }
.cto-lines button { display: inline-flex; align-items: baseline; gap: 8px; padding: 6px 14px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); cursor: pointer; font: inherit; color: var(--text); }
.cto-lines button b { color: var(--text-strong); }
.cto-lines button span { color: var(--muted); font-size: 13px; }
.cto-lines button[aria-pressed="true"] { border-color: var(--accent); background: var(--cto-fresh); }

.cto-card { position: relative; } /* frame, padding, glass: kit.ts */
.cto-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }

.cto-value { margin: 6px 0 2px; } /* type: kit.ts */
.cto-desc { color: var(--text); }
.cto-mini { position: relative; margin-top: 14px; }
.cto-mini svg { display: block; width: 100%; overflow: visible; }
.cto-mini text, .cto-plot text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.cto-mini text.is-strong { fill: var(--text-strong); font-weight: 600; font-size: 13px; }
.cto-plot .cto-mark { fill: var(--text); }
.cto-hit { fill: transparent; outline: none; cursor: default; }
.cto-hit:hover, .cto-hit:focus { fill: var(--cto-wash); }
.cto-legend { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 13px; color: var(--text); }
.cto-legend > span, .cto-legend > button { display: inline-flex; align-items: center; gap: 6px; }
.cto-legend > button { border: 0; background: transparent; padding: 2px 6px; margin-left: -6px; border-radius: 6px; cursor: pointer; color: inherit; font: inherit; }
.cto-legend > button b { color: var(--text-strong); font-weight: 600; font-variant-numeric: tabular-nums; }
.cto-legend > button:hover, .cto-legend > button[aria-pressed="true"] { background: var(--cto-fresh); }
.cto-sw { width: 10px; height: 10px; border-radius: 2px; display: inline-block; flex: none; }
.cto-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.cto-foot { margin-top: 8px; font-size: 13px; color: var(--text); display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.cto-link { border: 0; background: transparent; color: var(--accent); cursor: pointer; padding: 0; font: inherit; }
.cto-calc { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 6px; font-size: 13px; color: var(--text); }
.cto-calc input { width: 96px; padding: 3px 8px; border-radius: 8px; border: 1px solid var(--border); background: var(--cto-cell); color: var(--text-strong); font: inherit; }
.cto-calc b { color: var(--text-strong); }
.cto-flash { animation: cto-flash 1.6s ease-out; }
@keyframes cto-flash { 0% { background: var(--cto-fresh); } 100% { background: transparent; } }
.cto-tip { position: absolute; z-index: 10; pointer-events: none; background: var(--card); border: 1px solid var(--border-strong); border-radius: 10px; padding: 8px 10px; font-size: 13px; box-shadow: 0 8px 24px rgba(0,0,0,.25); min-width: 200px; }
.cto-tip .cto-when { color: var(--muted); margin-bottom: 4px; white-space: nowrap; }
.cto-tip .cto-row { display: flex; align-items: center; gap: 8px; }
.cto-tip .cto-row b { min-width: 40px; text-align: right; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.cto-tip .cto-key { width: 12px; height: 2px; border-radius: 1px; }
.cto-tip .cto-row span { color: var(--text); }

.cto-chart-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
.cto-plot { position: relative; height: 270px; }
.cto-plot svg { display: block; width: 100%; height: 100%; }
.cto-seg { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; }
.cto-seg button { border: 0; background: transparent; padding: 5px 12px; cursor: pointer; font: inherit; color: var(--text); }
.cto-seg button[aria-pressed="true"] { background: var(--cto-fresh); font-weight: 600; color: var(--text-strong); }
.cto-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.cto-table th { text-align: left; font-weight: 600; color: var(--text); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.cto-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-strong); }
.cto-table .is-num { text-align: right; font-variant-numeric: tabular-nums; }
.cto-weeks { max-height: 270px; overflow: auto; }

.cto-flow-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.cto-live { width: 8px; height: 8px; border-radius: 50%; background: var(--kt-ok); flex: none; animation: cto-pulse 1.6s infinite; }
@keyframes cto-pulse { 50% { opacity: .35; } }
.cto-stats { font-size: 18px; font-weight: 650; margin-top: 10px; color: var(--text-strong); }
.cto-stats span { color: var(--muted); font-weight: 400; margin: 0 6px; }
.cto-kanban { display: grid; grid-template-columns: 88px repeat(6, minmax(0, 1fr)); gap: 6px; margin-top: 12px; }
.cto-kb-h { padding: 4px 8px; }
.cto-kb-h b { font-size: 14px; color: var(--text-strong); }
.cto-kb-h .cto-n { color: var(--muted); margin-left: 6px; font-variant-numeric: tabular-nums; }
.cto-kb-h .cto-st { color: var(--muted); font-size: 12px; }
.cto-lane { white-space: nowrap; display: flex; align-items: center; justify-content: center; text-align: center; font-size: 13px; font-weight: 600; color: var(--text); border-radius: 10px; background: var(--cto-cell); padding: 6px; }
.cto-lane.is-wait { color: var(--text-strong); background: color-mix(in srgb, var(--kt-approve) 16%, var(--cto-cell)); }
.cto-cell { background: var(--cto-cell); border-radius: 10px; padding: 6px; display: grid; gap: 6px; align-content: start; min-height: 60px; }
.cto-cell.is-wait { background: color-mix(in srgb, var(--kt-approve) 6%, var(--cto-cell)); }
.cto-cell.is-span { grid-row: span 2; }
.cto-kcard { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 6px 8px; font-size: 12.5px; display: grid; gap: 2px; min-width: 0; text-align: left; color: var(--text); font-family: inherit; }
.cto-kcard .cto-ktop { display: flex; justify-content: space-between; gap: 6px; color: var(--muted); font-size: 12px; white-space: nowrap; }
.cto-kcard .cto-gate { color: var(--kt-approve); font-weight: 600; }
.cto-kcard .cto-ktitle { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-strong); }
.cto-kcard .cto-kfocus { color: var(--text); }
.cto-kcard .cto-kmeta { color: var(--muted); font-size: 12px; }
.cto-kcard .kt-btn { justify-self: start; margin-top: 4px; }
.cto-kcard.is-live { cursor: pointer; } /* its border says its state: kit.ts */
.cto-kcard.is-real { cursor: pointer; } /* 实测 is its tag, not its border */
.cto-kcard.is-new { animation: cto-flash 2.4s ease-out; }
.cto-kmore, .cto-kempty { color: var(--muted); font-size: 12px; padding: 0 4px; }
.cto-pop { position: absolute; z-index: 15; width: 440px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--accent); background: var(--card); box-shadow: 0 16px 40px rgba(0,0,0,.35); display: grid; gap: 8px; }
.cto-pop-head { display: flex; align-items: center; gap: 8px; }
.cto-pop-head b { font-size: 15px; color: var(--text-strong); }
.cto-pop-head .cto-x { margin-left: auto; border: 0; background: transparent; color: var(--muted); font-size: 18px; cursor: pointer; line-height: 1; }
.cto-pop-facts { color: var(--text); font-size: 13px; }
.cto-decisions { margin: 0; padding: 0; list-style: none; display: grid; gap: 6px; font-size: 14px; color: var(--text-strong); }
.cto-decisions li { display: grid; grid-template-columns: 72px 1fr; gap: 8px; }
.cto-decisions li b { font-weight: 600; white-space: nowrap; }
.cto-pop-act { display: flex; gap: 8px; margin-top: 2px; }

.cto-ledger-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 6px; }
.cto-kind { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
.cto-was { color: var(--muted); font-size: 12px; }
.cto-defect { color: var(--kt-warn); font-size: 12px; }
.cto-ids { white-space: nowrap; font-size: 13px; }
.cto-ids .cto-was { font-family: var(--font-body, sans-serif); }
.cto-ids .cto-was.kt-mono { font-family: var(--mono, ui-monospace, monospace); }
.cto-table tr.is-real td { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.cto-table tr.is-new td { animation: cto-flash 2.4s ease-out; }
.cto-src { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.cto-notes { color: var(--muted); font-size: 13px; }
.cto-notes summary { cursor: pointer; color: var(--text); }
.cto-notes ul { margin: 8px 0 0; padding-left: 18px; display: grid; gap: 4px; }
.cto-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 30; padding: 10px 16px; border-radius: 12px; background: var(--bg-hover); border: 1px solid var(--border); font-size: 14px; color: var(--text-strong); max-width: 640px; }

/* 交付详情: built from the CTO view's cards and charts and the board's pills, chips and icons */
.cto-item-head { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
.cto-item-head .kt-run-title { margin: 0; }
.cto-item-head .cto-org { color: var(--text); font-size: 14px; }
.cto-item-now { margin: -6px 0 0; color: var(--text-strong); font-size: 14px; }
.cto-item-act { display: flex; gap: 8px; flex-wrap: wrap; }
.cto-item-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.cto-value .cto-of { font-size: .5em; margin-left: 6px; } /* half the number: as big as the board's 「/38」 */
.cto-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 14px; }
.cto-chip { width: 26px; height: 26px; display: inline-grid; place-items: center; flex: none; border-radius: 8px; border: 2px solid var(--kt-ok-solid); background: var(--kt-ok-solid); color: #fff; }
.cto-chip.is-small { width: 22px; height: 22px; border-radius: 7px; }
.cto-chip.is-idle { border-style: dashed; border-color: var(--border-strong); background: transparent; color: var(--muted); opacity: .7; }
.cto-chip.is-back { border-color: var(--vs-rework); background: color-mix(in srgb, var(--vs-rework) 18%, transparent); color: var(--text-strong); }
.cto-chip.is-wait { border-color: var(--vs-person); background: color-mix(in srgb, var(--vs-person) 18%, transparent); color: var(--text-strong); }
.cto-chip.is-plain { border-color: var(--border-strong); background: transparent; color: var(--text-strong); }
.cto-segs { border: 0; background: transparent; padding: 0; margin-top: 14px; width: 100%; cursor: pointer; }
.cto-segs i { height: 10px; }
.cto-legend > button:disabled { cursor: default; color: var(--muted); }
.cto-legend > button .kt-role-icon { color: var(--vs-rework); }
.cto-gatecell { display: inline-flex; align-items: center; gap: 8px; white-space: nowrap; font-weight: 600; }
.cto-item-chain { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; margin-top: 10px; }
.cto-chainpart { display: flex; gap: 10px; align-items: flex-start; }
.cto-chainpart b, .cto-chainpart .cto-link { font-size: 15px; color: var(--text-strong); }
.cto-chainpart .cto-link { color: var(--accent); }
.cto-item-arrow { font-size: 22px; color: var(--muted); }
.cto-item-twinrow { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-top: 12px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--cto-glass); }
.cto-item-twinrow > div { flex: 1 1 320px; }
.cto-vs-plot { margin-top: 10px; }
.cto-vs-plot text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }
.cto-vs-plot text.is-strong { fill: var(--text-strong); font-weight: 600; font-size: 13px; }
.cto-vs-plot .cto-vs-lane { fill: var(--muted); }
.cto-vs-chip rect { fill: var(--kt-ok-solid); }
.cto-vs-chip .kt-role-icon { color: #fff; }
.cto-vs-chip.is-wait rect { fill: color-mix(in srgb, var(--vs-person) 22%, var(--card)); stroke: var(--vs-person); stroke-width: 1.5; }
.cto-vs-chip.is-wait .kt-role-icon { color: var(--text-strong); }
.cto-vs-tick { stroke: var(--border-strong); stroke-dasharray: 2 3; }
.cto-vs-moment circle { fill: var(--card); stroke: var(--border-strong); stroke-width: 1.5; }
.cto-vs-moment .kt-role-icon { color: var(--text-strong); }
.cto-vs-moment.is-wait circle { stroke: var(--vs-person); }
.cto-vs-moment.is-ok circle { stroke: var(--kt-ok); }
.cto-vs-moment.is-back circle { stroke: var(--vs-rework); }
.cto-vs-seg path { transition: filter .15s; }
.cto-vs-seg:hover path { filter: brightness(1.12); }
.cto-vs-seg.is-hl path { stroke: var(--text-strong); stroke-width: 2; }
.cto-vs-seg.is-hl text.is-strong { fill: var(--accent); }

/* the other two views: rows, cards and headings that open the next layer */
.cto-link-value { border: 0; background: transparent; padding: 0; font-family: inherit; color: var(--text-strong); cursor: pointer; text-align: left; display: block; }
.cto-link-value:hover { color: var(--accent); }
.cto-row-pick { cursor: pointer; }
.cto-row-pick:hover td { background: var(--cto-glass); }
.cto-row-pick:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.cto-link-value:hover { text-decoration: underline; text-decoration-thickness: 2px; text-underline-offset: 6px; }
.cto-table tr.is-hl td { animation: cto-flash 2.4s ease-out 2; background: var(--cto-fresh); }
.cto-kcard.is-hl { outline: 2px solid var(--accent); outline-offset: 2px; }
.cto-pick { cursor: pointer; }
.cto-kb-h button, .cto-lane button { border: 0; background: transparent; padding: 0; font: inherit; color: inherit; cursor: pointer; text-align: left; display: inline-flex; align-items: center; gap: 6px; }
.cto-kb-h button { display: block; }
.cto-kb-h button:hover b, .cto-lane button:hover { color: var(--accent); }
.cto-lane .kt-role-icon { color: var(--kt-approve); }
.cto-gate { display: inline-flex; align-items: center; gap: 4px; }
.cto-filter { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--accent); border-radius: 999px; padding: 1px 4px 1px 10px; font-size: 13px; color: var(--text-strong); background: var(--cto-fresh); }
.cto-filter button { border: 0; background: transparent; cursor: pointer; color: var(--muted); font: inherit; }
.cto-hit.is-pick { cursor: pointer; }
@media (max-width: 960px) { .cto-item-cards { grid-template-columns: 1fr 1fr; } }

.cto-root.is-projection { position: fixed; inset: 0; z-index: 2147483000; overflow: auto; background: var(--bg); font-size: 18px; padding: 24px 48px 60px; }
.cto-root.is-projection .cto-hero h2 { font-size: 46px; }
.cto-root.is-projection .cto-value { font-size: 56px; }
.cto-root.is-projection .cto-mini text { font-size: 15px; }
.cto-root.is-projection .cto-mini text.is-strong { font-size: 16px; }
.cto-root.is-projection .cto-noproj { display: none !important; }

.cto-print-only { display: none; }
@media print {
  @page { size: A4 landscape; margin: 10mm; }
  body * { visibility: hidden; }
  .cto-root, .cto-root * { visibility: visible; }
  .cto-root { position: absolute; left: 0; top: 0; width: 100%; padding: 0; font-size: 11px; }
  .cto-root .cto-noprint, .cto-root .cto-tip, .cto-root .cto-pop, .cto-root .cto-toast, .cto-root .cto-calc, .cto-root .cto-link { display: none !important; }
  .cto-lines button:not([aria-pressed="true"]) { display: none; }
  .cto-print-only { display: block; color: var(--muted); margin: 4px 0 8px; }
  .cto-card, .cto-cell, .cto-kcard, .cto-table tr { break-inside: avoid; }
  .cto-flow { break-before: page; }
  .cto-hero h2 { font-size: 24px; } .cto-value { font-size: 28px; }
  .cto-plot { height: 220px; }
}
@media (max-width: 1180px) { .cto-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 960px) { .cto-cards { grid-template-columns: 1fr; } .cto-kanban { grid-template-columns: 1fr; } .cto-cell.is-span { grid-row: auto; } .cto-pop { width: auto; left: 12px !important; right: 12px !important; } }
`, pi = ".kt-kpi, .cto-cards > .cto-card, .br-kpi", mi = ".kt-card, .kt-experts, .kt-kb, .kt-sign, .kt-start, .cto-root > section.cto-card, .br-card", hi = `
.kt-root { --kit-r: 16px; --kit-r-cell: 10px; --kit-pad-kpi: 16px 18px; --kit-pad-block: 16px 20px; --kit-gap-row: 12px; --kit-gap-block: 16px;
  --kit-ok: color-mix(in srgb, var(--kt-ok) 55%, var(--border)); --kit-wait: color-mix(in srgb, var(--kt-approve) 55%, var(--border));
  --kit-run: color-mix(in srgb, var(--kt-run) 55%, var(--border)); --kit-bad: color-mix(in srgb, var(--kt-bad) 55%, var(--border)); gap: var(--kit-gap-block); }
${`${pi}, ${mi}, .kt-graph, .kt-lane`} { border-radius: var(--kit-r); border: 1px solid var(--border); }
${pi}, ${mi} { background-color: var(--card); }
${pi} { position: relative; overflow: hidden; padding: var(--kit-pad-kpi); }
.kt-kpi::after, .cto-cards > .cto-card::after, .br-kpi::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--text) 4%, transparent), transparent 70%); }
${mi} { padding: var(--kit-pad-block); margin: 0; }
.kt-kpis, .cto-cards { gap: var(--kit-gap-row); align-items: stretch; }
.cto-kcard, .kt-kb-chip, .cto-cell, .cto-lane { border-radius: var(--kit-r-cell); }

.kt-kpi-label, .cto-eyebrow { font-size: .93em; font-weight: 650; color: var(--muted); letter-spacing: .04em; }
.kt-kpi-big, .cto-value { font-size: 2.85em; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text-strong); text-shadow: none; }
.kt-kpi-of, .cto-of { font-weight: 700; letter-spacing: 0; color: var(--muted); }
.kt-kpi-of { font-size: 1.43em; } /* beside the number; the CTO view's 「credits」「/37」 sit inside it at .5em: the same 20 px */
.kt-card-head h2, .kt-experts-title, .kt-kb-head b, .kt-sign-head h2, .cto-chart-head h3, .cto-flow-head h3, .cto-ledger-head h3 { margin: 0; font-size: 1.1em; font-weight: 700; color: var(--text-strong); letter-spacing: 0; }
.kt-kb-head b { display: inline-flex; align-items: center; gap: 6px; }
.kt-kb-head b .kt-role-icon { color: var(--kt-info); }
.kt-sign-done > .kt-role-icon { vertical-align: -3px; color: var(--kt-ok); }

/* the crumb of a view opened from another: where it is, the way back */
.kit-crumb { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: .93em; color: var(--muted); }
.kit-crumb button:not(.kt-btn) { border: 0; background: transparent; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
.kit-crumb button:not(.kt-btn):hover { text-decoration: underline; text-underline-offset: 3px; }
.kit-crumb b { color: var(--text-strong); font-weight: 600; }
.kit-crumb .kt-grow { flex: 1; }
.kt-where-why { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--text) 7%, transparent); color: var(--text); } /* a note, not a state: no border */

/* a border says a state */
/* (under .kt-root: a state outranks the frame rules above, \`.cto-root > section.cto-card\` among them) */
.kt-root .kt-kpi-tests.is-green, .kt-root .kt-wall.is-green, .kt-root .kt-sign.is-signed, .kt-root .cto-card.is-ok { border-color: var(--kit-ok); }
.kt-root .kt-sign:not(.is-signed), .kt-root .cto-card.is-wait { border-color: var(--kit-wait); }
.kt-root .cto-card.is-bad { border-color: var(--kit-bad); }
.kt-kpi-tests.is-green .kt-kpi-big, .kt-kpi-gates .kt-kpi-big, .cto-card.is-ok .cto-value { color: var(--kt-ok); }
.cto-card.is-bad .cto-value { color: var(--kt-bad); }
.cto-kcard { border-color: var(--border); box-shadow: none; }
.cto-kcard.is-live.is-wait { border-color: var(--kit-wait); }
.cto-kcard.is-live.is-agent { border-color: var(--kit-run); }
/* only a run in progress glows */
.kt-root.is-live .kt-kpi-tests.is-green, .kt-root.is-live .kt-wall.is-green { box-shadow: 0 0 34px -12px var(--kt-ok); }
.cto-kcard.is-live { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-approve) 18%, transparent); }
.cto-kcard.is-live.is-agent { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 18%, transparent); }
`, gi = [
	"ok",
	"run",
	"wait",
	"hand",
	"bad",
	"warn",
	"info",
	"idle"
], _i = {
	ok: "ok",
	run: "run",
	wait: "approve",
	hand: "handoff",
	bad: "bad",
	warn: "warn",
	info: "info",
	idle: "idle"
}, vi = `
.br-app { --br-ok: var(--kt-ok); --br-run: var(--kt-run); --br-wait: var(--kt-approve); --br-hand: var(--kt-handoff); --br-bad: var(--kt-bad);
  --br-warn: var(--kt-warn); --br-info: var(--kt-info); --br-idle: var(--kt-idle); --br-tone: var(--kt-idle);
  --br-cell: color-mix(in srgb, var(--text, #dcdadf) 5%, transparent);
  display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; color: var(--text);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 1.5; }
.br-app *, .br-app *::before, .br-app *::after { box-sizing: border-box; }
${gi.map((e) => `.br-app .tone-${e} { --br-tone: var(--kt-${_i[e]}); --kt-tone: var(--kt-${_i[e]}); }`).join("\n")}
.br-app :is(button, select, textarea, input, a, summary):focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.br-mono, .br-app code { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: .92em; }
.br-dim { color: var(--muted); }
.br-small { font-size: .86em; }
.br-strong { color: var(--text-strong); font-weight: 650; }
.br-bad-text { color: var(--kt-bad); }
.br-warn-text { color: var(--kt-warn); }
.br-ok-text { color: var(--kt-ok); }
.br-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.br-pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
.br-grow { flex: 1; }
.br-row { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; }
.br-stack { display: grid; gap: 10px; }
.br-list { margin: 0; padding-left: 1.3em; }
.br-list li { margin: 2px 0; }
.br-plain { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }

/* ---------- the app bar: the sample's (AppBar.tsx APP_CSS) ---------- */
.br-bar { display: flex; align-items: center; gap: 6px 18px; flex-wrap: wrap; padding: 10px 20px 0; border-bottom: 1px solid var(--border); font-size: 14px; }
.br-bar h1 { margin: 0; display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }
.br-bar h1 .kt-role-icon { color: var(--accent); }
.br-tabs { display: flex; gap: 4px; align-self: stretch; flex-wrap: wrap; }
.br-tabs button { appearance: none; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--text); font: inherit; font-weight: 650;
  padding: 8px 12px 9px; margin-bottom: -1px; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: 6px; }
.br-tabs button:hover:not(:disabled) { color: var(--text-strong); }
.br-tabs button:disabled { color: var(--muted); cursor: default; opacity: .7; }
.br-tabs button[aria-selected="true"] { border-bottom-color: var(--accent); color: var(--text-strong); }
.br-count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.6em; padding: 0 6px; border-radius: 999px; font-size: .78em; font-weight: 800;
  background: var(--kt-approve); color: var(--kt-on); }
.br-bar .br-btn { margin: 4px 0 6px; }
.br-bar-key { font-family: var(--mono, ui-monospace, monospace); font-size: .82em; font-weight: 700; color: var(--muted); }

/* ---------- a view: a kt-root (the board's frame, padding and gaps) ---------- */
.br-view h2 { margin: 0; font-size: 1.1em; font-weight: 700; color: var(--text-strong); }
.br-view h3 { margin: 0; font-size: 1em; font-weight: 700; color: var(--text-strong); }
.br-view-head { display: flex; align-items: baseline; gap: 8px 14px; flex-wrap: wrap; }
.br-view-head h2 { font-size: 1.65em; font-weight: 800; letter-spacing: -.01em; }
.br-view-head p { margin: 0; color: var(--muted); }
/* a card: framed by kit.ts (radius 16, 1 px border, padding 16/20) */
.br-card { display: grid; gap: 10px; min-width: 0; align-content: start; }
.br-card > header { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }
.br-card > header h2, .br-card > header h3 { font-size: 1.1em; font-weight: 700; color: var(--text-strong); }
.br-card.is-wait { border-color: var(--kit-wait); }
.br-card.is-bad { border-color: var(--kit-bad); }
.br-card.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }
.br-card.is-ok { border-color: var(--kit-ok); }
.br-card.is-run { border-color: var(--kit-run); }
.br-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; align-items: start; }
.br-loading { color: var(--muted); margin: 12px 0; }
.br-empty { color: var(--muted); padding: 6px 0; margin: 0; }

/* ---------- buttons, chips, banners: the board's ---------- */
.br-btn { appearance: none; font: inherit; font-size: .93em; font-weight: 650; padding: 7px 14px; border-radius: 10px; cursor: pointer; white-space: nowrap;
  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); display: inline-flex; align-items: center; gap: 6px;
  transition: border-color .15s, background .15s; }
.br-btn:hover:not(:disabled) { border-color: var(--accent); }
.br-btn:disabled { opacity: .55; cursor: not-allowed; }
.br-btn.is-primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }
.br-btn.is-primary:hover:not(:disabled) { filter: brightness(1.08); }
.br-btn.is-danger { color: var(--kt-bad); border-color: color-mix(in srgb, var(--kt-bad) 55%, var(--border)); }
.br-btn.is-small { padding: 4px 10px; font-size: .84em; border-radius: 8px; }
.br-btn.is-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }
.br-btn[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 18%, var(--card)); color: var(--text-strong); }
.br-link { appearance: none; border: 0; background: transparent; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-decoration: none; }
.br-link:hover { text-decoration: underline; text-underline-offset: 3px; }
a.br-link { display: inline-flex; align-items: center; gap: 3px; }
.br-chip { display: inline-flex; align-items: center; gap: 5px; padding: 2px 10px; border-radius: 999px; font-size: .86em; font-weight: 750; white-space: nowrap;
  color: var(--br-tone); background: color-mix(in srgb, var(--br-tone) 14%, transparent); border: 1px solid color-mix(in srgb, var(--br-tone) 42%, transparent); }
button.br-chip { cursor: pointer; font-family: inherit; }
button.br-chip:hover { border-color: var(--br-tone); }
.br-tag { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: 7px; font-size: .84em; border: 1px solid var(--border); color: var(--text); white-space: nowrap;
  background: var(--kt-glass); }
button.br-tag { cursor: pointer; font-family: var(--mono, ui-monospace, monospace); }
button.br-tag:hover { border-color: var(--accent); color: var(--text-strong); }
.br-banner { padding: 9px 13px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-warn) 55%, var(--border));
  background: color-mix(in srgb, var(--kt-warn) 9%, var(--card)); display: grid; gap: 6px; }
.br-banner.is-error { border-color: color-mix(in srgb, var(--kt-bad) 60%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }
.br-banner.is-ok { border-color: color-mix(in srgb, var(--kt-ok) 55%, var(--border)); background: color-mix(in srgb, var(--kt-ok) 8%, var(--card)); }
.br-banner.is-info { border-color: color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 8%, var(--card)); }
.br-banners { display: grid; gap: 8px; padding: 12px 20px 0; }
.br-banners:empty { display: none; }
.br-error { margin: 0; color: var(--kt-bad); font-weight: 650; }
.br-note { margin: 0; color: var(--muted); font-size: .9em; }

/* ---------- a line the person types themselves (magenta: it waits for a person) ---------- */
.br-line { display: grid; gap: 6px; padding: 10px 12px; border-radius: 12px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 60%, var(--border));
  background: color-mix(in srgb, var(--kt-approve) 7%, transparent); }
.br-line code { font-size: 1.05em; font-weight: 700; color: var(--text-strong); user-select: all; word-break: break-all; }
.br-line p { margin: 0; color: var(--text); font-size: .88em; }

/* ---------- problems: what is wrong, 做什么, the fix, brain-kit's own words folded ---------- */
.br-probs { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
.br-prob { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 2px 10px; align-items: start; padding: 9px 12px; border-radius: 12px;
  border: 1px solid var(--border); background: var(--kt-glass); }
.br-prob.is-FAIL { border-color: color-mix(in srgb, var(--kt-bad) 50%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }
.br-prob.is-WARN { border-color: color-mix(in srgb, var(--kt-warn) 45%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }
.br-prob.is-OK { border-color: transparent; background: transparent; padding-top: 3px; padding-bottom: 3px; }
.br-prob-glyph { grid-row: span 3; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-weight: 900; font-size: 13px;
  color: var(--kt-tone); border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }
.br-prob.is-OK .br-prob-glyph { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); color: #fff; width: 20px; height: 20px; border-radius: 6px; font-size: 11px; }
.br-prob-text { font-weight: 700; color: var(--text-strong); }
.br-prob-repo { margin-right: 6px; font-weight: 650; vertical-align: 1px; }
.br-prob.is-OK .br-prob-text { font-weight: 550; color: var(--text); }
.br-prob-todo { color: var(--text); font-size: .93em; }
.br-prob-todo b { color: var(--muted); font-weight: 650; margin-right: 4px; }
.br-prob-acts { display: flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; margin-top: 4px; }
.br-raw { font-size: .82em; color: var(--muted); }
.br-raw summary { cursor: pointer; list-style: none; display: inline-flex; align-items: center; gap: 4px; }
.br-raw summary::-webkit-details-marker { display: none; }
.br-raw summary::before { content: '▸'; font-size: .9em; }
.br-raw[open] summary::before { content: '▾'; }
.br-raw pre { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word;
  font-family: var(--mono, ui-monospace, monospace); font-size: 1em; }
.br-fixjob { display: grid; gap: 6px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; border: 1px solid var(--border); background: var(--card); }
/* where an install goes: the options of a kit fix, one line each, the recommended one marked */
.br-modes { display: grid; gap: 6px; justify-items: start; }
.br-me { display: flex; align-items: center; gap: 6px; margin: 0; }
.br-me.is-bad { color: var(--kt-warn); }
.br-me-ask { display: grid; gap: 4px; max-width: 34em; }
.br-me-ask label { font-weight: 650; font-size: .9em; }
.br-me-ask .br-row { flex-wrap: nowrap; }
.br-me-ask input { flex: 1; min-width: 0; }
.br-mode { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; }
.br-mode.is-off .br-hint { color: var(--kt-warn); }

/* ---------- tables: the CTO view's ---------- */
.br-scroll { overflow-x: auto; }
.br-table { width: 100%; border-collapse: collapse; font-size: .96em; }
.br-table th { text-align: left; font-weight: 600; color: var(--text); padding: 8px 10px; border-bottom: 1px solid var(--border); white-space: nowrap; }
.br-table td { padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; color: var(--text-strong); }
.br-table tr:last-child td { border-bottom: 0; }
.br-table .is-num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.br-key { font-weight: 750; font-family: var(--mono, ui-monospace, monospace); white-space: nowrap; }

/* ---------- progress ---------- */
.br-prog { display: inline-flex; gap: 2px; vertical-align: middle; }
.br-prog > i { width: 7px; height: 9px; border-radius: 2px; background: color-mix(in srgb, var(--muted) 28%, transparent); }
.br-prog > i.is-done { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 45%, transparent); }
.br-prog > i.is-started { background: var(--kt-run); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-run) 55%, transparent); }
.br-prog > i.is-skipped { background: color-mix(in srgb, var(--kt-ok) 35%, transparent); }
.br-bars { display: grid; gap: 7px; }
.br-barrow { display: grid; grid-template-columns: minmax(120px, 13em) 1fr 3.5em; gap: 10px; align-items: center; }
.br-bartrack { height: 12px; border-radius: 6px; background: color-mix(in srgb, var(--muted) 16%, transparent); overflow: hidden; }
.br-bartrack > i { display: block; height: 100%; background: var(--accent); border-radius: 6px; }

/* ---------- forms: the board's start form ---------- */
.br-form { display: grid; gap: 14px; }
.br-field { display: grid; gap: 5px; }
.br-field > label, .br-field > .br-label, .br-fieldset legend { font-weight: 750; color: var(--text-strong); }
.br-fieldset { border: 1px solid var(--border); border-radius: 12px; padding: 10px 14px 12px; margin: 0; display: grid; gap: 7px; background: var(--kt-glass); min-width: 0; }
.br-fieldset legend { padding: 0 6px; }
.br-app :is(input[type="text"], input:not([type]), input[type="number"], textarea, select) { font: inherit; padding: 8px 10px; border-radius: 10px;
  border: 1px solid var(--border-strong, var(--border)); background: var(--bg); color: var(--text); max-width: 100%; }
.br-app :is(input, textarea)::placeholder { color: var(--muted); }
.br-app textarea { resize: vertical; min-height: 64px; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }
.br-field textarea { width: 100%; box-sizing: border-box; }
.br-app input[aria-invalid="true"] { border-color: var(--kt-bad); }
.br-check { display: inline-flex; align-items: flex-start; gap: 7px; cursor: pointer; }
.br-check input { margin-top: 4px; accent-color: var(--accent); }
.br-hint { margin: 0; font-size: .86em; color: var(--muted); }
.br-findings { margin: 0; padding: 10px 12px; border-radius: 10px; background: var(--bg-elevated, var(--card)); border: 1px solid var(--border); display: grid; gap: 2px;
  font-family: var(--mono, ui-monospace, monospace); font-size: .86em; white-space: pre-wrap; word-break: break-word; max-height: 360px; overflow: auto; }
.br-findings .is-blocking { color: var(--kt-bad); font-weight: 650; }
.br-confirm { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--accent); background: color-mix(in srgb, var(--accent) 8%, var(--card)); }
.br-confirm.is-danger { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 8%, var(--card)); }

/* ---------- crumbs, facts, stages, timeline, brain ---------- */
.br-crumb { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; font-size: .93em; color: var(--muted); }
.br-crumb b { color: var(--text-strong); font-weight: 650; }
.br-head { display: grid; gap: 8px; }
.br-head .br-title { font-size: 1.5em; font-weight: 800; color: var(--text-strong); letter-spacing: -.01em; }
.br-facts { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
.br-facts dt { color: var(--muted); font-size: .93em; }
.br-facts dd { margin: 0; min-width: 0; word-break: break-word; }
.br-stages { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.br-stages li { display: grid; grid-template-columns: 2em 1.4em 1fr; gap: 6px; align-items: baseline; }
.br-stages .is-done, .br-stages .is-skipped { color: var(--muted); }
.br-stages .is-started { color: var(--text-strong); font-weight: 650; }
.br-glyph { text-align: center; color: var(--br-tone); font-weight: 800; }
.br-units { display: inline-flex; gap: 4px; flex-wrap: wrap; margin-left: 6px; }
.br-day { margin: 8px 0 2px; font-size: .86em; font-weight: 700; color: var(--muted); }
.br-tl { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-tl li { display: grid; grid-template-columns: 3.4em 18px 1fr; gap: 8px; align-items: start; }
.br-tl time { color: var(--muted); font-variant-numeric: tabular-nums; font-size: .88em; padding-top: 1px; }
.br-q { display: grid; gap: 7px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }
.br-q.is-open { border-color: color-mix(in srgb, var(--kt-approve) 55%, var(--border)); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }
.br-q > *, .br-q .br-stack > * { min-width: 0; overflow-wrap: anywhere; }
.br-q .br-tag { display: inline-block; white-space: normal; overflow-wrap: anywhere; max-width: 100%; }
.br-q .br-row { min-width: 0; flex-wrap: wrap; }
.br-opts { margin: 0; padding-left: .2em; list-style: none; display: grid; gap: 3px; }
.br-files { display: flex; gap: 6px; flex-wrap: wrap; }
.br-entry { display: grid; gap: 6px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); scroll-margin: 80px; }
.br-entry.is-hl { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.br-entry .br-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-strong); }
.br-section { display: grid; gap: 8px; }
.br-section > h3 { margin-top: 6px; }
.br-group { display: grid; gap: 8px; }
.br-item { display: grid; gap: 7px; padding: 11px 13px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }

/* ---------- 导入仓库: the call to action, the checks, the steps ---------- */
.br-cta { justify-items: start; padding: 26px 28px; gap: 12px; }
.br-cta p { margin: 0; max-width: 46em; color: var(--text); }
.br-checks { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.br-checks li { display: grid; grid-template-columns: 1.4em minmax(6em, max-content) 1fr; gap: 2px 10px; align-items: baseline; }
.br-checks .br-todo { grid-column: 3; font-size: .88em; color: var(--muted); }
.br-steps { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.br-steps li { display: grid; grid-template-columns: 1.4em 1fr; gap: 2px 10px; align-items: baseline; }
.br-steps li.is-todo { color: var(--muted); }
.br-steps li.is-running { color: var(--text-strong); font-weight: 650; }
.br-steps .br-hint { grid-column: 2; font-weight: 400; }
.br-choice { display: flex; gap: 6px 18px; flex-wrap: wrap; }
.br-changes { max-height: 16em; overflow: auto; }

/* ---------- an empty state that says what to do: the board's (kt-empty), as a component (EmptyHero) ---------- */
.br-hero { display: grid; gap: 18px; padding: 26px 28px; border-radius: 22px; border: 1px solid var(--border);
  background: radial-gradient(90% 90% at 0% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 60%), var(--card); }
.br-hero h2 { margin: 0 0 6px; font-size: 2em; font-weight: 850; color: var(--text-strong); letter-spacing: -.01em; }
.br-hero p { margin: 0; max-width: 62em; color: var(--text); font-size: 1.03em; line-height: 1.65; }
.br-hero .br-punch { margin-top: 4px; font-size: 1.08em; font-weight: 850; color: var(--text-strong); }
.br-hero-acts { display: flex; align-items: center; gap: 10px 14px; flex-wrap: wrap; }
/* the steps of a flow, left to right (the board's kt-team-intro) */
.br-flow { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr)); gap: 22px; align-items: stretch; }
@media (max-width: 1000px) { .br-flow { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.br-flow > li { position: relative; display: grid; grid-template-columns: 36px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 9px; row-gap: 2px; padding: 10px 12px;
  border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); align-content: start; }
.br-flow > li:not(:last-child)::after { content: '→'; position: absolute; right: -17px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.2em; }
.br-flow > li > .kt-role-icon { grid-row: span 2; align-self: center; color: var(--text-strong); opacity: .9; }
.br-flow b { color: var(--text-strong); }
.br-flow small { color: var(--muted); font-size: .84em; }
.br-flow > li.is-done { border-color: var(--kit-ok); }
.br-flow > li.is-done > .kt-role-icon { color: var(--kt-ok); }
.br-flow > li.is-now { border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 28%, transparent); }
.br-flow > li.is-bad { border-color: var(--kit-bad); }
.br-flow > li.is-wait { border-color: var(--kit-wait); }
.br-flow > li.is-off { opacity: .55; border-style: dashed; }
.br-flow-n { display: inline-grid; place-items: center; width: 18px; height: 18px; margin-right: 6px; border-radius: 50%; font-size: .74em; font-weight: 800;
  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); vertical-align: 1px; }
.br-flow > li.is-done .br-flow-n { background: var(--kt-ok-solid); color: #fff; }
.br-flow > li.is-now .br-flow-n { background: var(--accent); color: var(--accent-fg, #fff); }

/* ---------- a counter card (the board's 指标卡, framed by kit.ts) ---------- */
.br-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
.br-kpi { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
.br-kpi-label { font-size: .93em; font-weight: 650; color: var(--muted); letter-spacing: .04em; }
.br-kpi-big { font-size: 2.6em; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.br-kpi-of { font-size: 1.4em; font-weight: 700; color: var(--muted); margin-left: 4px; }
.br-kpi-note { font-size: .84em; color: var(--muted); }
.br-kpi.is-ok .br-kpi-big { color: var(--kt-ok); }
.br-kpi.is-bad .br-kpi-big { color: var(--kt-bad); }
.br-kpi.is-wait .br-kpi-big { color: var(--kt-approve); }
.br-kpi.is-ok { border-color: var(--kit-ok); }
.br-kpi.is-bad { border-color: var(--kit-bad); }
.br-kpi.is-wait { border-color: var(--kit-wait); }
/* ---------- a background job's steps (clone, install, the kit fix) ---------- */
.br-jobsteps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }
.br-jobsteps li { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px 3px 5px; border-radius: 999px; font-size: .86em; font-weight: 650;
  border: 1px solid color-mix(in srgb, var(--kt-tone) 45%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 9%, var(--card)); color: var(--text); }
.br-jobsteps li i { font-style: normal; display: inline-grid; place-items: center; width: 19px; height: 19px; border-radius: 50%; font-size: .78em; font-weight: 900;
  background: color-mix(in srgb, var(--kt-tone) 30%, transparent); color: var(--text-strong); }
.br-jobsteps li.is-running { border-color: var(--kt-run); box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 20%, transparent); color: var(--text-strong); }
.br-jobsteps li.is-running i { animation: kt-blink 1.4s ease-in-out infinite; }
.br-jobsteps li.is-ok i { background: var(--kt-ok-solid); color: #fff; }
.br-jobsteps li.is-fail { border-color: var(--kt-bad); }
.br-jobsteps li.is-fail i { background: var(--kt-bad-solid); color: #fff; }
.br-jobsteps li.is-todo { opacity: .6; border-style: dashed; }
.br-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }
`, yi = {
	PRODUCT: "产品",
	TECH: "技术",
	IMPROVEMENT: "改进",
	PROJECT: "项目"
}, bi = {
	principle: "原则",
	correction: "纠正",
	decision: "决定",
	model: "模型",
	guideline: "准则",
	pitfall: "坑",
	process: "流程"
}, xi = {
	product: "产品",
	builder: "开发",
	shared: "共用"
}, Si = {
	new: "新",
	same: "只加来源",
	"adds-to": "补充",
	replaces: "取代",
	repeats: "又出现",
	withdraws: "撤回"
}, Ci = {
	new: "ok",
	same: "idle",
	"adds-to": "info",
	replaces: "warn",
	repeats: "warn",
	withdraws: "bad"
}, wi = (e) => {
	let [t, ...n] = e.split(" ");
	return Si[t] ? [Si[t], ...n].join(" ") : e;
}, Ti = (e) => Ci[e.split(" ")[0]] ?? "idle", Ei = (e, t) => e.sections.some((e) => e.entries.some((e) => e.id === t)), Di = (e) => e.sections.flatMap((e) => e.entries);
function Oi(e, t, n) {
	if (n && e.type !== n) return !1;
	if (!t) return !0;
	let r = t.toLowerCase();
	return [
		e.id,
		e.text,
		e.type,
		e.side,
		...e.src
	].some((e) => e.toLowerCase().includes(r));
}
var ki = (e) => [...e.errors, ...e.warnings], Ai = [
	{
		icon: "release",
		title: "做完一个需求",
		text: "运行写下 decisions.md"
	},
	{
		icon: "merge",
		title: "合并",
		text: "进默认分支"
	},
	{
		icon: "brain",
		title: "回写",
		text: "brain reflect：预览，写进新分支"
	},
	{
		icon: "laptop",
		title: "下一次用上",
		text: "运行加载它，用上了就引用"
	}
];
function ji({ entry: e, ...t }) {
	let n = c(), s = x(), l = (t.status?.repos ?? []).filter((e) => e.ok), [u, d] = o(e.repo ?? ""), h = u && (!t.status || l.some((e) => e.id === u)) ? u : l[0]?.id ?? "", g = D(h ? w.brain(h) : null, t.pollMs ?? 0), _ = g.data, [v, y] = o(e.file ?? (e.id ? ot(e.id) : void 0)), [b, S] = o(e.id), [C, T] = o(e.reflect), [E, O] = o(""), [k, A] = o(""), j = _ ? _.files.find((e) => e.key === v) ?? (b ? _.files.find((e) => Ei(e, b)) : void 0) ?? _.files[0] : void 0, M = C && _?.reflect.some((e) => e.key === C) ? C : _?.reflect[0]?.key, N = (e) => {
		let n = {
			repo: h || void 0,
			file: j?.key ?? v,
			id: b,
			reflect: C,
			...e
		};
		t.replace({
			kind: "brain",
			...n
		});
	}, P = (e) => {
		d(e), S(void 0), T(void 0), y(void 0), t.replace({
			kind: "brain",
			repo: e
		});
	}, F = (e) => {
		y(e), A("");
		let t = b && ot(b) === e ? b : void 0;
		S(t), N({
			file: e,
			id: t
		});
	}, I = (e) => {
		let t = _?.files.find((t) => Ei(t, e))?.key ?? ot(e);
		y(t), S(e), N({
			file: t,
			id: e
		});
	}, L = (e) => t.go({
		kind: "item",
		repo: h,
		key: e,
		from: "brain"
	}), R = a(null), ee = a(null);
	r(() => {
		if (!b || !_ || ee.current === b) return;
		let e = Array.from(R.current?.querySelectorAll("[data-entry-id]") ?? []).find((e) => e.dataset.entryId === b);
		e && (ee.current = b, e.scrollIntoView?.({
			behavior: s ? "auto" : "smooth",
			block: "center"
		}));
	}, [
		b,
		_,
		j?.key,
		s
	]);
	let te = i(() => j ? j.sections.map((e) => ({
		title: e.title,
		entries: e.entries.filter((e) => e.id === b || Oi(e, E.trim(), k))
	})).filter((e) => e.entries.length > 0) : [], [
		j,
		b,
		E,
		k
	]), ne = j ? Di(j).length : 0, z = te.reduce((e, t) => e + t.entries.length, 0), B = !!(b && _ && !_.files.some((e) => Ei(e, b))), re = !!_ && _.files.every((e) => Di(e).length === 0), ie = _ ? ki(_.lint) : [], ae = _ && /* @__PURE__ */ p(Vi, {
		repo: h,
		items: _.reflect,
		pick: M,
		onPick: (e) => {
			T(e), N({ reflect: e });
		},
		onItem: L,
		onApplied: g.reload,
		post: {
			preview: (e) => n.post(w.reflectPreview(), {
				repo: h,
				key: e
			}),
			apply: (e) => n.post(w.reflectApply(), e)
		}
	}, h);
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view bv-root",
		"data-testid": "br-brain",
		ref: R,
		children: [
			/* @__PURE__ */ p("style", { children: Ui }),
			/* @__PURE__ */ m("header", {
				className: "bv-top",
				children: [
					/* @__PURE__ */ p(V, {
						role: "brain",
						size: 26,
						className: "bv-top-icon"
					}),
					/* @__PURE__ */ m("div", {
						className: "br-view-head",
						children: [/* @__PURE__ */ p("h2", { children: "Brain" }), /* @__PURE__ */ p("p", { children: "仓库里的共享知识：运行加载它，用上了就引用" })]
					}),
					/* @__PURE__ */ p("span", { className: "br-grow" }),
					/* @__PURE__ */ m("label", {
						className: "bv-repo",
						htmlFor: "brain-repo",
						children: [/* @__PURE__ */ p("span", {
							className: "br-dim",
							children: "仓库"
						}), /* @__PURE__ */ p("select", {
							id: "brain-repo",
							value: h,
							onChange: (e) => P(e.target.value),
							disabled: l.length === 0,
							children: l.map((e) => /* @__PURE__ */ m("option", {
								value: e.id,
								children: [
									e.name,
									"（",
									e.id,
									"）"
								]
							}, e.id))
						})]
					}),
					_?.ref && /* @__PURE__ */ m("span", {
						className: "bv-ref",
						title: "读的是默认分支上的这个提交",
						children: ["读的是 ", /* @__PURE__ */ p("code", { children: _.ref })]
					}),
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn",
						onClick: g.reload,
						disabled: !h,
						children: [/* @__PURE__ */ p(H, {
							name: "RefreshCw",
							size: 14
						}), "重新读取"]
					})
				]
			}),
			t.status && l.length === 0 && /* @__PURE__ */ p(Le, {
				title: "还没有能用的仓库",
				onImport: () => t.go({ kind: "import" })
			}),
			/* @__PURE__ */ p(Y, {
				loading: g.loading,
				error: g.error,
				has: !!_
			}),
			_?.error && /* @__PURE__ */ p("div", {
				className: "br-banner is-error",
				role: "alert",
				children: _.error
			}),
			_ && re && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ p(Ue, {
					testid: "brain-empty",
					title: "Brain 还是空的",
					text: ["每个需求合并以后，在下面「回写」：brain reflect 把那次运行 decisions.md 里的提议写进 brain/ 的四个文件，写在一个新分支上（可以开 MR）。"],
					punch: "写进去的条目，下一次运行会加载；用上了就引用，这里都看得到。",
					flow: Ai
				}),
				ie.length > 0 && /* @__PURE__ */ p(Ri, { rows: ie }),
				ae
			] }),
			_ && !re && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ p(Mi, {
					data: _,
					lint: ie,
					onEntry: I
				}),
				/* @__PURE__ */ m("div", {
					className: "bv-main",
					children: [/* @__PURE__ */ m("div", {
						className: "bv-col",
						children: [/* @__PURE__ */ p("div", {
							className: "bv-tabs",
							role: "group",
							"aria-label": "Brain 文件",
							children: _.files.map((e) => /* @__PURE__ */ m("button", {
								type: "button",
								className: `bv-tab is-${e.key}`,
								"aria-pressed": j?.key === e.key,
								onClick: () => F(e.key),
								children: [
									/* @__PURE__ */ p("b", {
										className: "bv-letter",
										"aria-hidden": "true",
										children: e.letter
									}),
									/* @__PURE__ */ m("span", {
										className: "bv-tab-name",
										children: [
											e.key,
											" ",
											/* @__PURE__ */ p("small", { children: yi[e.key] ?? e.letter })
										]
									}),
									" ",
									/* @__PURE__ */ p("span", {
										className: "bv-tab-n",
										children: e.count
									})
								]
							}, e.key))
						}), j && /* @__PURE__ */ m("section", {
							className: `br-card bv-file is-${j.key}`,
							"aria-label": `${j.key}.md`,
							children: [
								/* @__PURE__ */ m("header", { children: [
									/* @__PURE__ */ m("h3", { children: [j.key, ".md"] }),
									/* @__PURE__ */ p("span", {
										className: "br-tag",
										children: xi[j.side] ?? j.side
									}),
									/* @__PURE__ */ p("span", { className: "br-grow" }),
									/* @__PURE__ */ m("span", {
										className: "br-dim br-small",
										children: [
											"显示 ",
											z,
											"/",
											ne,
											" 条"
										]
									})
								] }),
								/* @__PURE__ */ m("div", {
									className: "bv-filter",
									children: [/* @__PURE__ */ m("label", {
										className: "bv-search",
										htmlFor: "brain-text",
										children: [
											/* @__PURE__ */ p("span", {
												className: "br-sr",
												children: "按文字筛"
											}),
											/* @__PURE__ */ p(H, {
												name: "Search",
												size: 14
											}),
											/* @__PURE__ */ p("input", {
												id: "brain-text",
												type: "text",
												placeholder: "按 id、文字、来源筛",
												value: E,
												onChange: (e) => O(e.target.value)
											})
										]
									}), /* @__PURE__ */ p(Ii, {
										file: j,
										type: k,
										onType: A
									})]
								}),
								B && /* @__PURE__ */ m("p", {
									className: "br-note",
									children: [
										"Brain 里没有 ",
										/* @__PURE__ */ p("span", {
											className: "br-mono",
											children: b
										}),
										"：可能已经撤回、归档，或者写错了。"
									]
								}),
								te.length === 0 && /* @__PURE__ */ p("p", {
									className: "br-empty",
									children: ne ? "没有符合筛选的条目。" : "这个文件还没有条目。"
								}),
								te.map((e, t) => /* @__PURE__ */ m("div", {
									className: "bv-sec",
									children: [/* @__PURE__ */ m("h4", { children: [
										e.title,
										" ",
										/* @__PURE__ */ p("span", {
											className: "br-dim",
											children: e.entries.length
										})
									] }), /* @__PURE__ */ p("div", {
										className: "bv-entries",
										children: e.entries.map((e) => /* @__PURE__ */ p(Li, {
											e,
											hl: e.id === b
										}, e.id))
									})]
								}, `${e.title}-${t}`))
							]
						})]
					}), /* @__PURE__ */ m("div", {
						className: "bv-col",
						children: [/* @__PURE__ */ p(Ri, { rows: ie }), /* @__PURE__ */ p(zi, {
							usage: _.usage,
							onEntry: I
						})]
					})]
				}),
				/* @__PURE__ */ p(Bi, {
					runs: _.usage.runs,
					onEntry: I,
					onItem: L
				}),
				ae
			] })
		]
	});
}
function Mi({ data: e, lint: t, onEntry: n }) {
	let r = e.files.reduce((e, t) => e + Di(t).length, 0), i = e.files.flatMap(Di).filter((e) => e.candidate), a = t.filter((e) => e.level === "FAIL").length, o = t.filter((e) => e.level === "WARN").length, s = e.usage;
	return /* @__PURE__ */ m("div", {
		className: "br-kpis bv-kpis",
		role: "group",
		"aria-label": "指标",
		children: [
			/* @__PURE__ */ p(We, {
				label: "条目",
				value: r,
				of: "条",
				testid: "kpi-entries",
				children: /* @__PURE__ */ p(Ni, {
					files: e.files,
					total: r
				})
			}),
			/* @__PURE__ */ p(We, {
				label: "知识有用率",
				value: N(s.useful).pct,
				of: N(s.useful).frac,
				note: "加载的条目里，用上的",
				testid: "usage-useful",
				children: /* @__PURE__ */ p(Pi, {
					rate: s.useful,
					hit: "pass",
					label: "用上的"
				})
			}),
			/* @__PURE__ */ p(We, {
				label: "重复纠正率",
				value: N(s.repeat_rate).pct,
				of: N(s.repeat_rate).frac,
				note: "同样的纠正又出现的",
				testid: "usage-repeat",
				children: /* @__PURE__ */ p(Pi, {
					rate: s.repeat_rate,
					hit: "fail",
					label: "又出现的"
				})
			}),
			/* @__PURE__ */ p(We, {
				label: "撤回候选",
				value: i.length,
				of: "条",
				testid: "kpi-candidates",
				note: i.length ? "加载够多次，从没被引用" : `没有 · 已归档 ${s.archived} · 已清除 ${s.purged}`,
				children: i.length > 0 && /* @__PURE__ */ p(Fi, {
					ids: i.map((e) => e.id),
					onEntry: n,
					tone: "warn"
				})
			}),
			/* @__PURE__ */ p(We, {
				label: "检查 · brain lint",
				value: a,
				of: "个错",
				tone: a ? "bad" : o ? void 0 : "ok",
				testid: "kpi-lint",
				note: a || o ? `${o} 个提醒` : "全过",
				children: t.length > 0 && /* @__PURE__ */ p("div", {
					className: "kt-segs bv-cells",
					role: "img",
					"aria-label": `${a} 个错，${o} 个提醒`,
					children: t.map((e, t) => /* @__PURE__ */ p("i", {
						className: e.level === "FAIL" ? "is-fail" : "is-warn",
						title: e.text
					}, t))
				})
			})
		]
	});
}
function Ni({ files: e, total: t }) {
	return /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("div", {
		className: "bv-stack",
		role: "img",
		"aria-label": e.map((e) => `${e.key} ${Di(e).length}`).join("，"),
		children: [e.map((e) => {
			let t = Di(e).length;
			return t > 0 ? /* @__PURE__ */ p("i", {
				className: `is-${e.key}`,
				style: { flexGrow: t },
				title: `${e.key} ${t} 条`
			}, e.key) : null;
		}), t === 0 && /* @__PURE__ */ p("i", { className: "is-none" })]
	}), /* @__PURE__ */ p("div", {
		className: "cto-legend bv-legend",
		children: e.map((e) => /* @__PURE__ */ m("span", { children: [
			/* @__PURE__ */ p("i", {
				className: `cto-sw is-${e.key}`,
				"aria-hidden": "true"
			}),
			yi[e.key] ?? e.key,
			" ",
			/* @__PURE__ */ p("b", { children: Di(e).length })
		] }, e.key))
	})] });
}
function Pi({ rate: [e, t], hit: n, label: r }) {
	return t <= 0 ? /* @__PURE__ */ p("div", {
		className: "kt-kpi-note",
		children: "还没有数"
	}) : t <= 40 ? /* @__PURE__ */ p(Ge, {
		label: `${e}/${t} ${r}`,
		cells: Array.from({ length: t }, (t, r) => ({ tone: r < e ? n : "idle" }))
	}) : /* @__PURE__ */ p("div", {
		className: `bv-meter is-${n}`,
		role: "img",
		"aria-label": `${e}/${t} ${r}`,
		children: /* @__PURE__ */ p("i", { style: { width: `${Math.round(e / t * 100)}%` } })
	});
}
function Fi({ ids: e, onEntry: t, tone: n = "idle" }) {
	return e.length ? /* @__PURE__ */ p("span", {
		className: "bv-ids",
		children: e.map((e) => /* @__PURE__ */ p("button", {
			type: "button",
			className: `br-chip tone-${n}`,
			title: "在 Brain 里看这一条",
			onClick: () => t(e),
			children: e
		}, e))
	}) : /* @__PURE__ */ p("span", {
		className: "br-dim",
		children: "—"
	});
}
function Ii({ file: e, type: t, onType: n }) {
	let r = Di(e), i = e.types.filter((e) => r.some((t) => t.type === e)), a = Array.from(new Set(r.map((e) => e.type))).filter((e) => !i.includes(e)), o = [...i, ...a];
	return o.length < 2 ? null : /* @__PURE__ */ m("div", {
		className: "bv-types",
		role: "group",
		"aria-label": "按类型筛",
		children: [/* @__PURE__ */ m("button", {
			type: "button",
			className: "bv-type",
			"aria-pressed": t === "",
			onClick: () => n(""),
			children: ["全部 ", /* @__PURE__ */ p("b", { children: r.length })]
		}), o.map((e) => /* @__PURE__ */ m("button", {
			type: "button",
			className: "bv-type",
			"aria-pressed": t === e,
			title: e,
			onClick: () => n(t === e ? "" : e),
			children: [
				bi[e] ?? e,
				" ",
				/* @__PURE__ */ p("b", { children: r.filter((t) => t.type === e).length })
			]
		}, e))]
	});
}
function Li({ e, hl: t }) {
	let n = e.loaded_by > 0 ? Math.min(1, e.runs / e.loaded_by) : 0;
	return /* @__PURE__ */ m("article", {
		className: `bv-entry${t ? " is-hl" : ""}${e.candidate ? " is-cand" : ""}`,
		"data-entry-id": e.id,
		"aria-current": t ? "true" : void 0,
		"aria-label": e.id,
		children: [
			/* @__PURE__ */ m("div", {
				className: "bv-entry-top",
				children: [
					/* @__PURE__ */ p("b", {
						className: "br-key",
						children: e.id
					}),
					/* @__PURE__ */ p("span", {
						className: "br-chip tone-info",
						title: e.type,
						children: bi[e.type] ?? e.type
					}),
					/* @__PURE__ */ p("span", {
						className: "br-tag",
						children: xi[e.side] ?? e.side
					}),
					e.rel && e.rel !== "new" && /* @__PURE__ */ p("span", {
						className: "br-tag",
						title: e.rel,
						children: wi(e.rel)
					}),
					/* @__PURE__ */ p("span", { className: "br-grow" }),
					e.repeats > 0 && /* @__PURE__ */ m("span", {
						className: `br-chip tone-${e.repeats >= 2 ? "bad" : "warn"}`,
						children: [
							"重复 ",
							e.repeats,
							" 次"
						]
					}),
					e.candidate && /* @__PURE__ */ p("span", {
						className: "br-chip tone-warn",
						title: "被够多的运行加载过，一次也没被引用",
						children: "撤回候选"
					})
				]
			}),
			/* @__PURE__ */ p("p", {
				className: "bv-text",
				children: e.text
			}),
			/* @__PURE__ */ m("div", {
				className: "bv-entry-foot",
				children: [/* @__PURE__ */ m("span", {
					className: "bv-use",
					title: `被 ${e.loaded_by} 次运行加载，其中 ${e.runs} 次引用了它（共引用 ${e.cites} 处）`,
					children: [/* @__PURE__ */ p("span", {
						className: `bv-meter is-pass${e.candidate ? " is-cand" : ""}`,
						"aria-hidden": "true",
						children: /* @__PURE__ */ p("i", { style: { width: `${Math.round(n * 100)}%` } })
					}), /* @__PURE__ */ m("span", { children: [e.loaded_by ? /* @__PURE__ */ m(f, { children: [
						e.loaded_by,
						" 次加载 · ",
						/* @__PURE__ */ p("b", { children: e.runs }),
						" 次用上"
					] }) : "还没被加载过", e.cites > e.runs ? `（引用 ${e.cites} 处）` : ""] })]
				}), e.src.length > 0 && /* @__PURE__ */ m("span", {
					className: "bv-src",
					children: [/* @__PURE__ */ p("span", {
						className: "br-dim",
						children: "来源"
					}), e.src.map((e) => /* @__PURE__ */ p("span", {
						className: "br-tag br-mono",
						children: e
					}, e))]
				})]
			})
		]
	});
}
function Ri({ rows: e }) {
	let t = e.filter((e) => e.level === "FAIL").length, n = e.filter((e) => e.level === "WARN").length;
	return /* @__PURE__ */ m("section", {
		className: `br-card${t ? " is-bad" : e.length ? "" : " is-ok"}`,
		"aria-label": "检查",
		"data-testid": "lint",
		children: [/* @__PURE__ */ m("header", { children: [
			/* @__PURE__ */ p(V, {
				role: "lint",
				size: 18
			}),
			/* @__PURE__ */ p("h3", { children: "检查" }),
			/* @__PURE__ */ p("span", {
				className: "br-dim br-small",
				children: "brain lint · 默认分支"
			}),
			/* @__PURE__ */ p("span", { className: "br-grow" }),
			t > 0 && /* @__PURE__ */ m("span", {
				className: "br-chip tone-bad",
				children: [t, " 个错"]
			}),
			n > 0 && /* @__PURE__ */ m("span", {
				className: "br-chip tone-warn",
				children: [n, " 个提醒"]
			})
		] }), /* @__PURE__ */ p(Te, { rows: e.length ? e : [{
			level: "OK",
			text: "全过：没有问题"
		}] })]
	});
}
function zi({ usage: e, onEntry: t }) {
	return /* @__PURE__ */ m("section", {
		className: "br-card",
		"aria-label": "用处",
		children: [
			/* @__PURE__ */ m("header", { children: [
				/* @__PURE__ */ p(V, {
					role: "list",
					size: 18
				}),
				/* @__PURE__ */ p("h3", { children: "用处" }),
				/* @__PURE__ */ p("span", { className: "br-grow" }),
				/* @__PURE__ */ m("span", {
					className: "br-dim br-small",
					children: [
						"已归档 ",
						e.archived,
						" · 已清除 ",
						e.purged
					]
				})
			] }),
			/* @__PURE__ */ m("div", {
				className: "bv-block",
				children: [/* @__PURE__ */ p("b", {
					className: "bv-block-h",
					children: "又出现的纠正"
				}), e.repeats_any.length === 0 ? /* @__PURE__ */ p("p", {
					className: "br-empty",
					children: "没有：同样的纠正没再出现过。"
				}) : /* @__PURE__ */ p("ul", {
					className: "bv-repeats",
					"data-testid": "usage-repeats",
					children: e.repeats_any.map(([e, n]) => /* @__PURE__ */ m("li", { children: [
						/* @__PURE__ */ p("button", {
							type: "button",
							className: `br-chip tone-${n >= 2 ? "bad" : "warn"}`,
							onClick: () => t(e),
							children: e
						}),
						/* @__PURE__ */ p("span", {
							className: "bv-rep-n",
							"aria-hidden": "true",
							children: Array.from({ length: Math.min(n, 8) }, (e, t) => /* @__PURE__ */ p("i", {}, t))
						}),
						/* @__PURE__ */ m("span", { children: [
							"重复 ",
							n,
							" 次"
						] }),
						n >= 2 && /* @__PURE__ */ p("span", {
							className: "br-chip tone-bad kt-pill",
							title: "同样的纠正出现两次以上：写成确定性检查（gate），别再靠 agent 记住",
							children: "该改成 gate 了"
						})
					] }, e))
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "bv-block",
				children: [/* @__PURE__ */ p("b", {
					className: "bv-block-h",
					children: "从没被引用"
				}), /* @__PURE__ */ p(Fi, {
					ids: e.never_cited,
					onEntry: t
				})]
			})
		]
	});
}
function Bi({ runs: e, onEntry: t, onItem: n }) {
	return /* @__PURE__ */ m("section", {
		className: "br-card",
		"aria-label": "每次运行的用处",
		children: [/* @__PURE__ */ m("header", { children: [
			/* @__PURE__ */ p(V, {
				role: "laptop",
				size: 18
			}),
			/* @__PURE__ */ p("h3", { children: "每次运行" }),
			/* @__PURE__ */ p("span", {
				className: "br-dim br-small",
				children: "加载了几条，用上了哪些"
			})
		] }), e.length === 0 ? /* @__PURE__ */ p("p", {
			className: "br-empty",
			children: "还没有运行记下它用了 Brain 的哪些条目。"
		}) : /* @__PURE__ */ p("div", {
			className: "br-scroll",
			children: /* @__PURE__ */ m("table", {
				className: "cto-table bv-runs",
				"aria-label": "每次运行",
				children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
					/* @__PURE__ */ p("th", { children: "需求" }),
					/* @__PURE__ */ p("th", { children: "intent" }),
					/* @__PURE__ */ p("th", { children: "加载 · 用上" }),
					/* @__PURE__ */ p("th", { children: "引用" }),
					/* @__PURE__ */ p("th", { children: "过时" }),
					/* @__PURE__ */ p("th", { children: "不认识" })
				] }) }), /* @__PURE__ */ p("tbody", { children: e.map((e) => {
					let r = e.loaded ? Math.min(1, e.cited.length / e.loaded) : 0;
					return /* @__PURE__ */ m("tr", { children: [
						/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => n(e.key),
							children: e.key
						}) }),
						/* @__PURE__ */ p("td", {
							className: "br-mono br-dim",
							children: e.intent
						}),
						/* @__PURE__ */ p("td", { children: /* @__PURE__ */ m("span", {
							className: "bv-load",
							children: [/* @__PURE__ */ p("span", {
								className: "bv-meter is-pass",
								"aria-hidden": "true",
								children: /* @__PURE__ */ p("i", { style: { width: `${Math.round(r * 100)}%` } })
							}), /* @__PURE__ */ m("span", {
								className: "br-mono",
								children: [
									e.loaded ?? "—",
									" · ",
									e.cited.length
								]
							})]
						}) }),
						/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(Fi, {
							ids: e.cited,
							onEntry: t,
							tone: "ok"
						}) }),
						/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(Fi, {
							ids: e.stale,
							onEntry: t,
							tone: "warn"
						}) }),
						/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(Fi, {
							ids: e.unknown,
							onEntry: t,
							tone: "bad"
						}) })
					] }, `${e.key}-${e.intent}`);
				}) })]
			})
		})]
	});
}
function Vi({ repo: e, items: t, pick: n, onPick: r, onItem: i, onApplied: a, post: s }) {
	let c = O(s.preview), l = O(s.apply), [u, d] = o(null), f = c.result && c.result.key === n ? c.result : null, h = !f || f.problems.length > 0 || !!f.error || !f.substantive, g = !!l.result?.ok, _ = async (t) => {
		if (!n) return;
		let r = await l.run({
			repo: e,
			key: n,
			push: t
		});
		d(null), r && a();
	}, v = [
		["选一次运行", n ? "done" : "now"],
		["预览", f ? "done" : n ? "now" : void 0],
		["确认写入", g ? "done" : f ? !f.substantive && !f.error ? "off" : h ? "bad" : "now" : void 0],
		["写在新分支上", g ? "done" : l.result ? "bad" : void 0]
	], y = t.find((e) => e.key === n);
	return /* @__PURE__ */ m("section", {
		className: `br-card bv-reflect${g ? " is-ok" : ""}`,
		"aria-label": "回写",
		children: [
			/* @__PURE__ */ m("header", { children: [
				/* @__PURE__ */ p(V, {
					role: "brain",
					size: 20
				}),
				/* @__PURE__ */ p("h3", { children: "回写" }),
				/* @__PURE__ */ p("span", {
					className: "br-dim br-small",
					children: "brain reflect：把一次运行 decisions.md 里的提议写进 Brain，先预览，再写进新分支"
				})
			] }),
			/* @__PURE__ */ p("ol", {
				className: "bv-steps",
				"aria-label": "回写的步骤",
				children: v.map(([e, t], n) => /* @__PURE__ */ m("li", {
					className: t ? `is-${t}` : void 0,
					"data-state": t,
					children: [/* @__PURE__ */ p("i", {
						"aria-hidden": "true",
						children: t === "done" ? "✓" : t === "bad" ? "✕" : t === "off" ? "–" : n + 1
					}), /* @__PURE__ */ p("span", { children: e })]
				}, e))
			}),
			t.length === 0 ? /* @__PURE__ */ p("p", {
				className: "br-empty",
				children: "还没有能回写的运行：运行写下 decisions.md 以后，就会出现在这里。"
			}) : /* @__PURE__ */ m("div", {
				className: "bv-pick",
				children: [
					/* @__PURE__ */ p("label", {
						className: "br-sr",
						htmlFor: "reflect-key",
						children: "选一个需求"
					}),
					/* @__PURE__ */ p("select", {
						id: "reflect-key",
						value: n ?? "",
						onChange: (e) => {
							r(e.target.value), c.reset(), l.reset(), d(null);
						},
						children: t.map((e) => /* @__PURE__ */ m("option", {
							value: e.key,
							children: [
								e.key,
								" · ",
								e.title
							]
						}, e.key))
					}),
					y && /* @__PURE__ */ p(U, { state: y.state }),
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: !n || c.busy,
						onClick: () => {
							l.reset(), d(null), n && c.run(n);
						},
						children: [/* @__PURE__ */ p(H, {
							name: "Eye",
							size: 14
						}), c.busy ? "正在预览…" : f ? "再预览一次" : "预览"]
					}),
					n && /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-link",
						onClick: () => i(n),
						children: "看需求详情"
					})
				]
			}),
			c.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: c.error
			}),
			f && /* @__PURE__ */ m("div", {
				className: "bv-preview",
				"data-testid": "reflect-preview",
				children: [
					f.source && /* @__PURE__ */ m("p", {
						className: "br-note",
						children: ["读的是 ", /* @__PURE__ */ p("span", {
							className: "br-mono",
							children: f.source
						})]
					}),
					f.error && /* @__PURE__ */ p("p", {
						className: "br-error br-pre",
						role: "alert",
						children: f.error
					}),
					f.problems.length > 0 && /* @__PURE__ */ p("div", {
						"data-testid": "reflect-problems",
						children: /* @__PURE__ */ p(Te, { rows: f.problems.map((e) => ({
							level: "FAIL",
							text: e
						})) })
					}),
					f.ops.length > 0 && /* @__PURE__ */ p("div", {
						className: "br-scroll",
						children: /* @__PURE__ */ m("table", {
							className: "cto-table bv-ops",
							"aria-label": "要写的改动",
							children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
								/* @__PURE__ */ p("th", { children: "动作" }),
								/* @__PURE__ */ p("th", { children: "条目" }),
								/* @__PURE__ */ p("th", { children: "写到" }),
								/* @__PURE__ */ p("th", { children: "类型" }),
								/* @__PURE__ */ p("th", { children: "来源" }),
								/* @__PURE__ */ p("th", { children: "文字" })
							] }) }), /* @__PURE__ */ p("tbody", { children: f.ops.map((e, t) => /* @__PURE__ */ m("tr", { children: [
								/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p("span", {
									className: `br-chip tone-${Ti(e.kind)}`,
									title: e.kind,
									children: wi(e.kind)
								}) }),
								/* @__PURE__ */ p("td", {
									className: "br-mono",
									children: e.target ?? /* @__PURE__ */ p("span", {
										className: "br-dim",
										children: "新条目"
									})
								}),
								/* @__PURE__ */ m("td", { children: [e.file ? /* @__PURE__ */ p("span", {
									className: `bv-filetag is-${e.file}`,
									children: e.file
								}) : /* @__PURE__ */ p("span", {
									className: "br-dim",
									children: "—"
								}), e.section && /* @__PURE__ */ m("span", {
									className: "br-dim",
									children: [" · ", e.section]
								})] }),
								/* @__PURE__ */ p("td", { children: e.type ? /* @__PURE__ */ p("span", {
									className: "br-chip tone-info",
									children: bi[e.type] ?? e.type
								}) : /* @__PURE__ */ p("span", {
									className: "br-dim",
									children: "—"
								}) }),
								/* @__PURE__ */ p("td", { children: e.src.length ? /* @__PURE__ */ p("span", {
									className: "bv-src",
									children: e.src.map((e) => /* @__PURE__ */ p("span", {
										className: "br-tag br-mono",
										children: e
									}, e))
								}) : "—" }),
								/* @__PURE__ */ p("td", {
									className: "br-pre",
									children: e.text || /* @__PURE__ */ p("span", {
										className: "br-dim",
										children: "—"
									})
								})
							] }, t)) })]
						})
					}),
					f.ops.length === 0 && !f.error && /* @__PURE__ */ p("p", {
						className: "br-empty",
						children: "没有要写的改动。"
					}),
					f.gaps.length > 0 && /* @__PURE__ */ m("div", {
						className: "bv-block",
						children: [/* @__PURE__ */ p("b", {
							className: "bv-block-h",
							children: "Brain 里缺的"
						}), /* @__PURE__ */ p("ul", {
							className: "bv-gaps",
							children: f.gaps.map((e, t) => /* @__PURE__ */ m("li", { children: [
								/* @__PURE__ */ p("b", { children: e.title }),
								/* @__PURE__ */ p("span", {
									className: "br-tag",
									children: e.kind
								}),
								/* @__PURE__ */ p("span", { children: e.what })
							] }, t))
						})]
					}),
					f.warnings.length > 0 && /* @__PURE__ */ p(Te, { rows: f.warnings.map((e) => ({
						level: "WARN",
						text: e
					})) }),
					f.notes.length > 0 && /* @__PURE__ */ p("ul", {
						className: "br-list br-dim br-small",
						children: f.notes.map((e, t) => /* @__PURE__ */ p("li", { children: e }, t))
					}),
					!f.substantive && !f.error && /* @__PURE__ */ p("p", {
						className: "br-note",
						children: "这次只是给已有条目加来源，不用开分支。"
					}),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [/* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn",
							disabled: h || l.busy,
							"aria-pressed": u === !1,
							onClick: () => d(!1),
							children: [/* @__PURE__ */ p(H, {
								name: "GitBranch",
								size: 14
							}), "写入新分支"]
						}), /* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn",
							disabled: h || l.busy,
							"aria-pressed": u === !0,
							onClick: () => d(!0),
							children: [/* @__PURE__ */ p(H, {
								name: "GitPullRequest",
								size: 14
							}), "写入并开 MR"]
						})]
					}),
					u !== null && !h && /* @__PURE__ */ m("div", {
						className: "br-confirm",
						role: "group",
						"aria-label": "确认写入",
						children: [/* @__PURE__ */ p("p", {
							className: "br-pre",
							children: u ? `在 main 上开一个新分支写入 ${n} 的 ${f.ops.length} 处改动，推到远端并开 MR。你现在的工作目录不动。` : `在 main 上开一个新分支写入 ${n} 的 ${f.ops.length} 处改动，只在本机，不推。你现在的工作目录不动。`
						}), /* @__PURE__ */ m("div", {
							className: "br-row",
							children: [/* @__PURE__ */ p("button", {
								type: "button",
								className: "br-btn is-primary",
								disabled: l.busy,
								onClick: () => void _(u),
								children: l.busy ? "正在写…" : "确定写入"
							}), /* @__PURE__ */ p("button", {
								type: "button",
								className: "br-btn",
								disabled: l.busy,
								onClick: () => d(null),
								children: "取消"
							})]
						})]
					})
				]
			}),
			l.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			}),
			l.result && /* @__PURE__ */ m("div", {
				className: `br-banner ${l.result.ok ? "is-ok" : "is-error"} bv-applied`,
				"data-testid": "reflect-applied",
				children: [
					/* @__PURE__ */ p("p", {
						className: l.result.ok ? "br-strong" : "br-error",
						role: "status",
						children: l.result.ok ? `写好了${l.result.branch ? `：分支 ${l.result.branch}` : ""}` : "没写成，看下面的输出。"
					}),
					l.result.worktree && /* @__PURE__ */ m("p", {
						className: "br-note",
						"data-testid": "reflect-worktree",
						children: ["工作区：", /* @__PURE__ */ p("span", {
							className: "br-mono",
							children: l.result.worktree
						})]
					}),
					l.result.output && /* @__PURE__ */ p("pre", {
						className: "br-findings",
						children: l.result.output
					})
				]
			})
		]
	});
}
var Hi = (e, t, n, r) => `--bv-PRODUCT: ${e}; --bv-TECH: ${t}; --bv-IMPROVEMENT: ${n}; --bv-PROJECT: ${r};`, Ui = `
.bv-root { ${Hi("#3987e5", "#9085e9", "#d95926", "#3ea37a")} }
:root[data-mode="light"] .bv-root { ${Hi("#2a78d6", "#6250d6", "#eb6834", "#1f8a5c")} }
.bv-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.bv-top-icon { color: var(--accent); }
.bv-top .br-view-head p { font-size: .93em; }
.bv-repo { display: inline-flex; align-items: center; gap: .5em; font-size: .93em; }
.bv-repo select { padding: .35em .7em; border-radius: .7em; }
.bv-ref { font-size: .86em; color: var(--muted); padding: .2em .7em; border-radius: 999px; background: var(--kt-glass); border: 1px solid var(--border); }
.bv-ref code { color: var(--text-strong); }
.bv-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@media (max-width: 1200px) { .bv-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bv-kpis .br-kpi-big { font-size: 2.6em; }
.bv-stack { display: flex; gap: 2px; height: .8em; margin-top: .2em; border-radius: .3em; overflow: hidden; }
.bv-stack i { flex: 1 1 0; min-width: .4em; background: var(--muted); }
.bv-stack i.is-none { background: color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-stack i:last-child { border-radius: 0 .3em .3em 0; }
.bv-root .is-PRODUCT { --bv-c: var(--bv-PRODUCT); } .bv-root .is-TECH { --bv-c: var(--bv-TECH); }
.bv-root .is-IMPROVEMENT { --bv-c: var(--bv-IMPROVEMENT); } .bv-root .is-PROJECT { --bv-c: var(--bv-PROJECT); }
.bv-stack i[class*="is-"]:not(.is-none), .bv-legend .cto-sw { background: var(--bv-c); }
.bv-legend { margin-top: .3em; gap: .2em .9em; font-size: .86em; }
.bv-legend b { color: var(--text-strong); font-variant-numeric: tabular-nums; }
.bv-cells i.is-warn { background: var(--kt-warn); }
.bv-ids { display: inline-flex; flex-wrap: wrap; gap: .3em; }
.bv-ids .br-chip { font-family: var(--mono, ui-monospace, monospace); font-size: .8em; padding: .1em .6em; }
.bv-meter { display: inline-block; width: 5em; height: .55em; border-radius: .3em; overflow: hidden; vertical-align: middle;
  background: color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-meter > i { display: block; height: 100%; border-radius: .3em; background: var(--kt-ok); }
.bv-meter.is-fail > i { background: var(--kt-bad); }
.br-kpi .bv-meter { width: 100%; height: .6em; margin-top: .2em; }
.bv-meter.is-cand { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--kt-warn) 70%, transparent); }

.bv-main { display: grid; grid-template-columns: minmax(0, 1fr) minmax(22em, 30em); gap: var(--kit-gap-block, 16px); align-items: start; }
@media (max-width: 1200px) { .bv-main { grid-template-columns: minmax(0, 1fr); } }
.bv-col { display: grid; gap: var(--kit-gap-row, 12px); min-width: 0; align-content: start; }
.bv-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6em; }
@media (max-width: 800px) { .bv-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bv-tab { appearance: none; font: inherit; display: grid; grid-template-columns: 2.3em minmax(0, 1fr) auto; align-items: center; gap: .7em; padding: .6em .9em;
  border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; text-align: left; }
.bv-tab:hover { border-color: var(--border-strong); }
.bv-tab[aria-pressed="true"] { border-color: var(--bv-c, var(--accent)); background: color-mix(in srgb, var(--bv-c, var(--accent)) 12%, var(--card));
  box-shadow: 0 0 0 1px var(--bv-c, var(--accent)); }
.bv-letter { display: grid; place-items: center; width: 2.3em; height: 2.3em; border-radius: .6em; font-weight: 850; color: #fff; background: var(--bv-c, var(--muted)); }
.bv-tab-name { display: flex; flex-direction: column; font-weight: 750; color: var(--text-strong); letter-spacing: .02em; min-width: 0; }
.bv-tab-name small { font-size: .82em; font-weight: 550; color: var(--muted); letter-spacing: 0; }
.bv-tab-n { font-size: 1.6em; font-weight: 800; font-variant-numeric: tabular-nums; color: var(--text-strong); }
.bv-file { border-top: 3px solid var(--bv-c, var(--border)); }
.bv-filter { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.bv-search { display: inline-flex; align-items: center; gap: .4em; padding: 0 .4em 0 .7em; border-radius: 10px; border: 1px solid var(--border-strong, var(--border));
  background: var(--bg); color: var(--muted); flex: 0 1 22em; }
.bv-search input { border: 0 !important; background: transparent !important; padding: .45em .2em !important; flex: 1; min-width: 0; outline: none; }
.bv-search:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
.bv-types { display: flex; flex-wrap: wrap; gap: .35em; }
.bv-type { appearance: none; font: inherit; font-size: .86em; padding: .2em .8em; border-radius: 999px; border: 1px solid var(--border); background: transparent; color: var(--text); cursor: pointer; }
.bv-type b { color: var(--muted); font-weight: 700; margin-left: .2em; }
.bv-type:hover { border-color: var(--accent); }
.bv-type[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--text-strong); }
.bv-type[aria-pressed="true"] b { color: var(--text-strong); }
.bv-sec { display: grid; gap: .5em; }
.bv-sec > h4 { margin: .4em 0 0; font-size: .93em; font-weight: 750; color: var(--text-strong); letter-spacing: .04em; }
.bv-entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(22em, 1fr)); gap: .7em; }
.bv-entry { display: grid; gap: .5em; align-content: start; padding: .8em 1em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border);
  background: var(--bg-elevated, var(--card)); scroll-margin: 6em; border-left: 3px solid var(--bv-c, var(--border)); }
.bv-file .bv-entry { --bv-c: inherit; }
.bv-entry.is-cand { border-color: color-mix(in srgb, var(--kt-warn) 50%, var(--border)); border-left-color: var(--kt-warn); border-style: dashed; border-left-style: solid; }
.bv-entry.is-hl { border-color: var(--accent); border-left-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 30%, transparent); }
.bv-entry-top { display: flex; align-items: center; gap: .4em .5em; flex-wrap: wrap; }
.bv-entry-top .br-chip, .bv-entry-top .br-tag { font-size: .8em; }
.bv-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text-strong); line-height: 1.55; }
.bv-entry-foot { display: flex; align-items: center; justify-content: space-between; gap: .4em 1em; flex-wrap: wrap; font-size: .82em; color: var(--muted); }
.bv-use { display: inline-flex; align-items: center; gap: .5em; }
.bv-use b { color: var(--text-strong); }
.bv-src { display: inline-flex; align-items: center; gap: .3em; flex-wrap: wrap; }
.bv-src .br-tag { font-size: .92em; padding: 0 .45em; }

.bv-block { display: grid; gap: .45em; }
.bv-block-h { font-size: .86em; font-weight: 700; color: var(--muted); letter-spacing: .04em; }
.bv-repeats { list-style: none; margin: 0; padding: 0; display: grid; gap: .45em; }
.bv-repeats li { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }
.bv-repeats .br-chip { font-family: var(--mono, ui-monospace, monospace); font-size: .82em; }
.bv-rep-n { display: inline-flex; gap: 2px; }
.bv-rep-n i { width: .5em; height: .9em; border-radius: 2px; background: var(--kt-bad); }
.bv-runs td { vertical-align: middle; }
.bv-load { display: inline-flex; align-items: center; gap: .5em; white-space: nowrap; }

.bv-steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; counter-reset: s; }
.bv-steps li { position: relative; display: flex; align-items: center; gap: .55em; padding: .5em .6em; font-weight: 650; color: var(--muted); }
.bv-steps li:not(:last-child)::after { content: ''; flex: 1; height: 2px; margin: 0 .2em 0 .4em; border-radius: 1px; background: color-mix(in srgb, var(--muted) 30%, transparent); }
.bv-steps li i { font-style: normal; flex: none; display: grid; place-items: center; width: 1.8em; height: 1.8em; border-radius: 50%; font-size: .86em; font-weight: 850;
  border: 2px dashed color-mix(in srgb, var(--muted) 55%, transparent); color: var(--muted); }
.bv-steps li span { white-space: nowrap; }
.bv-steps li.is-done { color: var(--text); }
.bv-steps li.is-done i { border: 2px solid var(--kt-ok-solid); background: var(--kt-ok-solid); color: #fff; }
.bv-steps li.is-done::after { background: var(--kt-ok); }
.bv-steps li.is-now { color: var(--text-strong); }
.bv-steps li.is-now i { border: 2px solid var(--accent); background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 22%, transparent); }
.bv-steps li.is-bad { color: var(--kt-bad); }
.bv-steps li.is-bad i { border: 2px solid var(--kt-bad); color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 14%, transparent); }
.bv-steps li.is-off { opacity: .6; }
.bv-pick { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; padding: .7em .9em; border-radius: var(--kit-r-cell, 10px); background: var(--kt-glass); border: 1px solid var(--border); }
.bv-pick select { min-width: 18em; }
.bv-preview { display: grid; gap: .8em; }
.bv-ops td { vertical-align: middle; }
.bv-filetag { display: inline-flex; padding: 0 .5em; border-radius: 6px; font-size: .84em; font-weight: 750; color: #fff; background: var(--bv-c, var(--muted)); }
.bv-gaps { list-style: none; margin: 0; padding: 0; display: grid; gap: .4em; }
.bv-gaps li { display: flex; align-items: baseline; gap: .5em; flex-wrap: wrap; padding: .5em .8em; border-radius: var(--kit-r-cell, 10px);
  border: 1px dashed color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }
.bv-gaps b { color: var(--text-strong); }
.bv-applied p { margin: 0; }
`, $ = (e) => Math.round(e).toLocaleString("zh-CN"), Wi = (e) => e.slice(5), Gi = (e) => Wi(e).replace(/^0/, "").replace("-0", "-").replace("-", "/"), Ki = [
	"unattended",
	"people",
	"local",
	"pending"
], qi = {
	unattended: "无人值守",
	people: "有人插手",
	local: "本机做完",
	pending: "还没评"
}, Ji = {
	unattended: "var(--s4)",
	people: "var(--vs-person)",
	local: "var(--s1)",
	pending: "var(--s3)"
};
function Yi(e = 600) {
	let t = a(null), [n, i] = o(e);
	return r(() => {
		let e = t.current;
		if (!e) return;
		let n = () => e.clientWidth > 0 && i(e.clientWidth);
		if (n(), typeof ResizeObserver > "u") return;
		let r = new ResizeObserver(n);
		return r.observe(e), () => r.disconnect();
	}, []), [t, n];
}
function Xi({ tip: e, width: t }) {
	let n = a(null), [i, s] = o(0);
	return r(() => {
		if (!e || !n.current) return;
		let r = n.current.offsetWidth || 200;
		s(Math.min(Math.max(e.x - r / 2, 0), Math.max(0, t - r)));
	}, [e, t]), e ? /* @__PURE__ */ m("div", {
		ref: n,
		className: "cto-tip",
		role: "tooltip",
		style: {
			left: i,
			top: e.y
		},
		children: [e.when && /* @__PURE__ */ p("div", {
			className: "cto-when",
			children: e.when
		}), e.rows.map(([e, t, n], r) => /* @__PURE__ */ m("div", {
			className: "cto-row",
			children: [
				/* @__PURE__ */ p("b", { children: e }),
				n && /* @__PURE__ */ p("i", {
					className: "cto-key",
					style: { background: n }
				}),
				/* @__PURE__ */ p("span", { children: t })
			]
		}, r))]
	}) : null;
}
function Zi({ x: e, y: t, w: n, h: r, rows: i, onTip: a, when: o, tipY: s, onPick: c, label: l }) {
	let u = () => a({
		x: e + n / 2,
		y: s ?? t + r + 6,
		rows: i,
		when: o
	});
	return /* @__PURE__ */ p("rect", {
		className: `cto-hit${c ? " is-pick" : ""}`,
		x: e,
		y: t,
		width: n,
		height: r,
		rx: 6,
		tabIndex: 0,
		role: c ? "button" : void 0,
		"aria-label": l,
		onPointerEnter: u,
		onFocus: u,
		onPointerLeave: () => a(null),
		onBlur: () => a(null),
		onClick: c,
		onKeyDown: c ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), c()) : void 0
	});
}
function Qi({ x: e, y: t, w: n, h: r, fill: i }) {
	let a = Math.min(4, n, r / 2);
	return /* @__PURE__ */ p("path", {
		d: `M${e},${t} H${e + n - a} Q${e + n},${t} ${e + n},${t + a} V${t + r - a} Q${e + n},${t + r} ${e + n - a},${t + r} H${e} Z`,
		fill: i
	});
}
function $i({ label: e, height: t, children: n }) {
	let [r, i] = Yi(360), [a, s] = o(null);
	return /* @__PURE__ */ m("div", {
		className: "cto-mini",
		ref: r,
		children: [/* @__PURE__ */ p("svg", {
			viewBox: `0 0 ${i} ${t}`,
			height: t,
			role: "img",
			"aria-label": e,
			children: n(i, s)
		}), /* @__PURE__ */ p(Xi, {
			tip: a,
			width: i
		})]
	});
}
function ea({ y0: e, bh: t, L: n, pw: r, max: i, segs: a, total: o, label: s, strong: c, onTip: l, tipLabel: u }) {
	let d = 0, f = a.filter((e) => e.n > 0), h = f.map((a, o) => {
		let s = n + d / i * r + (d > 0 ? 2 : 0), c = n + (d + a.n) / i * r;
		return d += a.n, c - s <= .5 ? null : o === f.length - 1 ? /* @__PURE__ */ p(Qi, {
			x: s,
			y: e,
			w: c - s,
			h: t,
			fill: a.fill
		}, a.key) : /* @__PURE__ */ p("rect", {
			x: s,
			y: e,
			width: c - s,
			height: t,
			fill: a.fill
		}, a.key);
	}), g = n + d / i * r;
	return /* @__PURE__ */ m("g", { children: [
		/* @__PURE__ */ p("text", {
			x: 0,
			y: e + t / 2 + 4,
			className: c ? "is-strong" : void 0,
			children: s
		}),
		h,
		d === 0 && /* @__PURE__ */ p("rect", {
			x: n,
			y: e,
			width: r,
			height: t,
			rx: 4,
			fill: "var(--cto-glass)"
		}),
		/* @__PURE__ */ p("text", {
			x: g + 8,
			y: e + t / 2 + 4,
			className: c ? "is-strong" : void 0,
			children: o
		}),
		/* @__PURE__ */ p(Zi, {
			x: n - 4,
			y: e - 3,
			w: Math.max(g - n, r * .3) + 8,
			h: t + 6,
			onTip: l,
			rows: [[o, u], ...a.map((e) => [
				$(e.n),
				e.name,
				e.fill
			])]
		})
	] });
}
function ta({ c: e }) {
	let t = (t) => e.runs.filter((e) => e.how === t).length, n = [{
		key: "unattended",
		n: t("unattended"),
		fill: Ji.unattended,
		name: qi.unattended
	}, {
		key: "people",
		n: t("people"),
		fill: Ji.people,
		name: qi.people
	}], r = [{
		key: "pending",
		n: t("pending"),
		fill: Ji.pending,
		name: qi.pending
	}, {
		key: "local",
		n: t("local"),
		fill: Ji.local,
		name: qi.local
	}], i = Math.max(1, n.reduce((e, t) => e + t.n, 0), r.reduce((e, t) => e + t.n, 0));
	return /* @__PURE__ */ p($i, {
		label: `评估过的交接：无人值守 ${n[0].n}，有人插手 ${n[1].n}；还没评 ${r[0].n}，本机做完 ${r[1].n}`,
		height: 62,
		children: (e, t) => {
			let a = Math.max(10, e - 64 - 56);
			return /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p(ea, {
				y0: 2,
				bh: 22,
				L: 64,
				pw: a,
				max: i,
				segs: n,
				total: `${n[0].n + n[1].n} 个`,
				label: "评估过的",
				strong: !0,
				onTip: t,
				tipLabel: "交接过、评估过的需求"
			}), /* @__PURE__ */ p(ea, {
				y0: 38,
				bh: 22,
				L: 64,
				pw: a,
				max: i,
				segs: r,
				total: `${r[0].n + r[1].n} 个`,
				label: "别的",
				onTip: t,
				tipLabel: "还没评、或只在本机做的"
			})] });
		}
	});
}
function na({ c: e }) {
	let t = e.stepped_in, n = t?.at_points ?? 0, r = t?.outside ?? 0, i = t?.kinds ?? [], a = [[
		"判断点上",
		n,
		"var(--s4)",
		!0
	], [
		"判断点外",
		r,
		"var(--vs-rework)",
		!1
	]], o = Math.max(1, n, r);
	return /* @__PURE__ */ p($i, {
		label: `人介入：判断点上 ${n} 次，判断点之外 ${r} 次`,
		height: 62,
		children: (e, t) => {
			let n = Math.max(10, e - 64 - 48);
			return a.map(([e, r, a, s], c) => {
				let l = 2 + c * 36, u = r / o * n, d = i.filter((e) => e.point === s);
				return /* @__PURE__ */ m("g", { children: [
					/* @__PURE__ */ p("text", {
						x: 0,
						y: l + 11 + 4,
						className: c === 0 ? "is-strong" : void 0,
						children: e
					}),
					r > 0 ? /* @__PURE__ */ p(Qi, {
						x: 64,
						y: l,
						w: Math.max(u, 1),
						h: 22,
						fill: a
					}) : /* @__PURE__ */ p("rect", {
						x: 64,
						y: l,
						width: n,
						height: 22,
						rx: 4,
						fill: "var(--cto-glass)"
					}),
					/* @__PURE__ */ m("text", {
						x: 64 + (r > 0 ? u : 0) + 8,
						y: l + 11 + 4,
						className: c === 0 ? "is-strong" : void 0,
						children: [$(r), " 次"]
					}),
					/* @__PURE__ */ p(Zi, {
						x: 60,
						y: l - 3,
						w: Math.max(u, n * .3) + 8,
						h: 28,
						onTip: t,
						rows: [[$(r), s ? "判断点上（批准、驳回、回答）" : "判断点之外"], ...d.map((e) => [$(e.n), e.label])]
					})
				] }, e);
			});
		}
	});
}
function ra({ rows: e, avg: t, onKey: n }) {
	let r = e.slice().sort((e, t) => t.credits - e.credits).slice(0, 6), i = Math.max(1, r.length) * 14 + 6, a = Math.max(1, ...r.map((e) => e.credits), t ?? 0);
	return /* @__PURE__ */ p($i, {
		label: `credits：${r.map((e) => `${e.key} ${e.credits}`).join("，")}${t === null ? "" : `；平均 ${t}`}`,
		height: i,
		children: (e, o) => {
			let s = Math.max(10, e - 64 - 46), c = t === null ? null : 64 + t / a * s;
			return /* @__PURE__ */ m(f, { children: [r.map((e, t) => {
				let r = 3 + t * 14, i = e.credits / a * s;
				return /* @__PURE__ */ m("g", { children: [
					/* @__PURE__ */ p("text", {
						x: 0,
						y: r + 9 - .5,
						style: { fontSize: 11 },
						className: t === 0 ? "is-strong" : void 0,
						children: e.key
					}),
					/* @__PURE__ */ p(Qi, {
						x: 64,
						y: r,
						w: Math.max(i, 1),
						h: 9,
						fill: "var(--s4)"
					}),
					/* @__PURE__ */ p("text", {
						x: 64 + i + 6,
						y: r + 9 - .5,
						style: { fontSize: 11 },
						children: e.credits.toFixed(1)
					}),
					/* @__PURE__ */ p(Zi, {
						x: 60,
						y: r - 2,
						w: Math.max(i, 30) + 8,
						h: 13,
						onTip: o,
						rows: [[e.credits.toFixed(1), `${e.key} 的 credits`], ...n ? [["点击", "看它的看板"]] : []],
						onPick: n ? () => n(e.key) : void 0,
						label: `${e.key}：${e.credits} credits`
					})
				] }, e.key);
			}), c !== null && /* @__PURE__ */ p("line", {
				x1: c,
				x2: c,
				y1: 0,
				y2: i,
				stroke: "var(--text-strong)",
				strokeWidth: 1,
				strokeDasharray: "3 3"
			})] });
		}
	});
}
function ia({ rows: e }) {
	let t = {
		person: "var(--vs-person)",
		check: "var(--s1)",
		brain: "var(--s4)",
		agent: "var(--s2)",
		unknown: "var(--s3)",
		unclassified: "var(--vs-rework)"
	}, n = e.reduce((e, t) => e + t.count, 0);
	return /* @__PURE__ */ p($i, {
		label: `决定：${e.map((e) => `${e.label} ${e.count}`).join("，")}`,
		height: 28,
		children: (r, i) => /* @__PURE__ */ p(ea, {
			y0: 2,
			bh: 22,
			L: 0,
			pw: Math.max(10, r - 0 - 50),
			max: Math.max(1, n),
			total: `${n} 个`,
			label: "",
			segs: e.map((e) => ({
				key: e.id,
				n: e.count,
				fill: t[e.id] ?? "var(--s3)",
				name: e.label
			})),
			onTip: i,
			tipLabel: "决定"
		})
	});
}
var aa = {
	person: "var(--vs-person)",
	check: "var(--s1)",
	brain: "var(--s4)",
	agent: "var(--s2)",
	unknown: "var(--s3)",
	unclassified: "var(--vs-rework)"
};
function oa(e) {
	let t = 10 ** Math.floor(Math.log10(Math.max(e, 1)));
	for (let n of [
		1,
		1.5,
		2,
		2.5,
		3,
		4,
		5,
		6,
		8,
		10
	]) if (n * t >= e) return n * t;
	return 10 * t;
}
function sa({ weeks: e, onWeek: t }) {
	let [n, r] = o(!1), [i, a] = Yi(1100), [s, c] = o(null), l = (e) => e.unattended + e.people + e.local + e.pending, u = e.reduce((e, t) => e + l(t), 0), d = Math.max(10, a - 40 - 12) / Math.max(1, e.length), f = Math.min(24, d * .56), h = oa(Math.max(1, ...e.map(l))), g = (e) => 200 - e / h * 180, _ = e.slice(-4).reduce((e, t) => e + l(t), 0);
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "每周合并",
		"data-anchor": "weekly",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [
					/* @__PURE__ */ p("h3", { children: "每周合并" }),
					/* @__PURE__ */ m("span", {
						className: "cto-dim",
						children: [
							"近 12 周合并了 ",
							$(u),
							" 个需求，最近 4 周 ",
							$(_),
							" 个 · 按交付方式"
						]
					}),
					/* @__PURE__ */ p("span", { className: "cto-grow" }),
					/* @__PURE__ */ m("div", {
						className: "cto-seg cto-noprint",
						role: "group",
						"aria-label": "图或表格",
						children: [/* @__PURE__ */ p("button", {
							type: "button",
							"aria-pressed": !n,
							onClick: () => r(!1),
							children: "图"
						}), /* @__PURE__ */ p("button", {
							type: "button",
							"aria-pressed": n,
							onClick: () => r(!0),
							children: "表格"
						})]
					})
				]
			}),
			!n && /* @__PURE__ */ p("div", {
				className: "cto-legend",
				children: Ki.map((e) => /* @__PURE__ */ m("span", { children: [/* @__PURE__ */ p("i", {
					className: "cto-sw",
					style: { background: Ji[e] }
				}), qi[e]] }, e))
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-plot br-weekly",
				ref: i,
				hidden: n,
				style: { height: 230 },
				children: [/* @__PURE__ */ m("svg", {
					viewBox: `0 0 ${a} 230`,
					role: "img",
					"aria-label": "每周合并的需求，按交付方式堆叠",
					children: [[
						0,
						1,
						2,
						3,
						4
					].map((e) => {
						let t = h / 4 * e, n = Math.round(g(t)) + .5;
						return /* @__PURE__ */ m("g", { children: [/* @__PURE__ */ p("line", {
							x1: 40,
							x2: a - 12,
							y1: n,
							y2: n,
							stroke: e === 0 ? "var(--border-strong)" : "var(--border)",
							strokeWidth: 1
						}), /* @__PURE__ */ p("text", {
							x: 32,
							y: n + 4,
							textAnchor: "end",
							children: Number.isInteger(t) ? $(t) : t.toFixed(1)
						})] }, e);
					}), e.map((n, r) => {
						let i = 40 + d * r + d / 2, a = i - f / 2, o = 0, s = Ki.filter((e) => n[e] > 0), u = s.map((e, t) => {
							let r = g(o) - (o > 0 ? 2 : 0), i = g(o + n[e]);
							o += n[e];
							let c = r - i;
							if (c <= .5) return null;
							if (t === s.length - 1) {
								let t = Math.min(4, c, f / 2);
								return /* @__PURE__ */ p("path", {
									d: `M${a},${r} V${i + t} Q${a},${i} ${a + t},${i} H${a + f - t} Q${a + f},${i} ${a + f},${i + t} V${r} Z`,
									fill: Ji[e]
								}, e);
							}
							return /* @__PURE__ */ p("rect", {
								x: a,
								y: i,
								width: f,
								height: c,
								fill: Ji[e]
							}, e);
						});
						return /* @__PURE__ */ m("g", { children: [
							u,
							l(n) > 0 && /* @__PURE__ */ p("text", {
								x: i,
								y: g(l(n)) - 6,
								textAnchor: "middle",
								className: "is-strong",
								children: l(n)
							}),
							r % 2 == (e.length - 1) % 2 && /* @__PURE__ */ p("text", {
								x: i,
								y: 218,
								textAnchor: "middle",
								children: Gi(n.week)
							}),
							/* @__PURE__ */ p(Zi, {
								x: 40 + d * r,
								y: 20,
								w: d,
								h: 180,
								onTip: c,
								tipY: Math.max(0, g(l(n)) - 110),
								when: `${Gi(n.week)} 起的一周`,
								rows: [
									[$(l(n)), "合并"],
									...Ki.map((e) => [
										$(n[e]),
										qi[e],
										Ji[e]
									]),
									...t ? [["点击", "看这一周合并的需求"]] : []
								],
								onPick: t ? () => t(n.week) : void 0,
								label: `${Gi(n.week)} 起的一周：${l(n)} 个`
							})
						] }, n.week);
					})]
				}), /* @__PURE__ */ p(Xi, {
					tip: s,
					width: a
				})]
			}),
			n && /* @__PURE__ */ p("div", {
				className: "cto-weeks",
				children: /* @__PURE__ */ m("table", {
					className: "cto-table",
					children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
						/* @__PURE__ */ p("th", { children: "一周起始" }),
						Ki.map((e) => /* @__PURE__ */ p("th", {
							className: "is-num",
							children: qi[e]
						}, e)),
						/* @__PURE__ */ p("th", {
							className: "is-num",
							children: "合计"
						})
					] }) }), /* @__PURE__ */ p("tbody", { children: e.map((e) => /* @__PURE__ */ m("tr", { children: [
						/* @__PURE__ */ p("td", { children: e.week }),
						Ki.map((t) => /* @__PURE__ */ p("td", {
							className: "is-num",
							children: $(e[t])
						}, t)),
						/* @__PURE__ */ p("td", {
							className: "is-num",
							children: $(l(e))
						})
					] }, e.week)) })]
				})
			})
		]
	});
}
//#endregion
//#region src/views/Detail.tsx
var ca = {
	overview: "交付总览",
	todo: "待办",
	brain: "Brain",
	board: "需求看板"
}, la = {
	person: "人",
	agent: "agent",
	check: "检查",
	brain: "Brain",
	bridge: "bridge",
	unclassified: "没归类"
}, ua = {
	stage: {
		icon: "design",
		label: "阶段"
	},
	approval: {
		icon: "approved",
		label: "审批"
	},
	human: {
		icon: "person",
		label: "人"
	},
	commit: {
		icon: "commit",
		label: "提交"
	},
	handover: {
		icon: "handover",
		label: "交接"
	},
	question: {
		icon: "question",
		label: "问题"
	},
	decision: {
		icon: "req",
		label: "决定"
	},
	blocked: {
		icon: "blocked",
		label: "拦下"
	},
	verify: {
		icon: "ci",
		label: "验证"
	},
	merge: {
		icon: "merge",
		label: "合并"
	},
	session: {
		icon: "laptop",
		label: "会话"
	},
	app: {
		icon: "brain",
		label: "app"
	}
}, da = "\n.br-detail .cto-item-head .kt-run-title { margin: 0; }\n.br-detail .cto-item-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n@media (max-width: 1180px) { .br-detail .cto-item-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-detail .br-twocol { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }\n@media (max-width: 1100px) { .br-detail .br-twocol { grid-template-columns: minmax(0, 1fr); } }\n.br-detail .br-col { display: grid; gap: 16px; min-width: 0; }\n.br-detail .br-detail-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 5px 22px; margin: 10px 0 0; padding: 10px 14px;\n  border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }\n.br-detail .br-detail-facts > div { display: grid; grid-template-columns: 6em minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }\n.br-detail .br-detail-facts dt { font-size: .86em; }\n.br-detail .br-detail-facts dd { overflow-wrap: anywhere; }\n.br-detail .br-stagecells { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 4px; }\n@media (max-width: 1100px) { .br-detail .br-stagecells { grid-template-columns: repeat(6, minmax(0, 1fr)); } }\n.br-detail .br-stagecell { position: relative; display: grid; gap: 2px; align-content: start; padding: 7px 8px 8px; border-radius: 10px; min-height: 64px;\n  border: 2px solid color-mix(in srgb, var(--kt-tone) 70%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 12%, var(--card)); }\n.br-detail .br-stagecell.is-done { background: var(--kt-ok-solid); border-color: color-mix(in srgb, var(--kt-ok) 75%, transparent); }\n.br-detail .br-stagecell.is-done :is(.br-stage-n, .br-stage-label) { color: #fff; }\n.br-detail .br-stagecell.is-skipped { border-style: dashed; background: transparent; opacity: .7; }\n.br-detail .br-stagecell.is-todo { border-style: dashed; background: transparent; border-color: var(--border-strong); }\n.br-detail .br-stagecell.is-started { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 25%, transparent), 0 0 18px -6px var(--kt-run); }\n.br-detail .br-stage-n { font-size: .74em; font-weight: 800; color: var(--muted); }\n.br-detail .br-stage-label { font-size: .86em; font-weight: 750; color: var(--text-strong); line-height: 1.25; }\n.br-detail .br-stage-units { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; }\n.br-detail .br-stage-units .br-chip { font-size: .7em; padding: 0 6px; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.br-detail .br-stagecells { list-style: none; margin: 0; padding: 0; }\n.br-detail .br-approvals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }\n.br-detail .br-approval { display: grid; gap: 6px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }\n.br-detail .br-approval[data-state=\"pending\"] { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }\n.br-detail .br-approval[data-state=\"approved\"] { border-color: var(--kit-ok); }\n.br-detail .cto-table td { vertical-align: top; }\n.br-detail .br-vs { position: relative; }\n.br-detail .br-vs svg { display: block; width: 100%; overflow: visible; }\n.br-detail .br-vs text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }\n.br-detail .br-vs text.is-strong { fill: var(--text-strong); font-weight: 650; font-size: 12.5px; }\n.br-detail .br-sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }\n.br-detail .br-session { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }\n.br-detail .br-session .kt-role-icon { color: var(--text-strong); }\n.br-detail .br-tl li { grid-template-columns: 3.4em 22px 1fr; }\n.br-detail .br-tl .kt-role-icon { color: var(--muted); }\n.br-detail .br-tl li[data-kind=\"merge\"] .kt-role-icon, .br-detail .br-tl li[data-kind=\"approval\"] .kt-role-icon { color: var(--kt-ok); }\n.br-detail .br-tl li[data-kind=\"blocked\"] .kt-role-icon { color: var(--kt-warn); }\n.br-detail .br-tl li[data-kind=\"handover\"] .kt-role-icon { color: var(--kt-handoff); }\n.br-detail .br-tlbox { max-height: 520px; overflow: auto; }\n", fa = {
	agent: "AI 在本机做",
	runner: "运行机在做",
	person: "等人",
	rework: "返工"
}, pa = {
	agent: "var(--vs-agent)",
	runner: "var(--s1)",
	person: "var(--vs-person)",
	rework: "var(--vs-rework)"
}, ma = {
	person: 4,
	rework: 3,
	runner: 2,
	agent: 1
};
function ha(e, t) {
	let n = [];
	for (let r of e.actors) for (let i of r.spans) {
		let a = i.kind === "wait" ? "person" : i.kind === "fix" ? "rework" : r.key === "runner" || r.key === "bridge" || r.key === "signer" ? "runner" : "agent", o = i.b ?? e.ended_at ?? t;
		o > i.a && n.push({
			a: i.a,
			b: o,
			part: a
		});
	}
	let r = [...new Set(n.flatMap((e) => [e.a, e.b]))].sort((e, t) => e - t), i = [];
	for (let e = 0; e < r.length - 1; e++) {
		let t = r[e], a = r[e + 1], o = n.filter((e) => e.a <= t && e.b >= a);
		if (!o.length) continue;
		let s = o.sort((e, t) => ma[t.part] - ma[e.part])[0].part, c = i[i.length - 1];
		c && c.part === s && Math.abs(c.to - t) < 1 ? c.to = a : i.push({
			from: t,
			to: a,
			part: s
		});
	}
	return i;
}
function ga({ entry: e, onBack: t, ...n }) {
	let r = D(w.requirement(e.repo, e.key), n.pollMs ?? 5e3), i = D(r.data ? w.board(e.repo, e.key) : null, n.pollMs ?? 5e3), [a, s] = o(null), c = ca[e.from ?? "overview"], l = () => {
		r.reload(), n.reloadStatus();
	}, u = r.data, d = i.data, h = u ? u.sessions.find((e) => e.kind === "local" && !e.error) ?? null : null, g = !!u && u.row.state === "local" && !h, _ = (t = !1) => n.go({
		kind: "board",
		repo: e.repo,
		key: e.key,
		from: "item",
		...t ? { replay: !0 } : {}
	});
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view cto-root cto-item br-detail",
		"data-testid": "br-detail",
		children: [
			/* @__PURE__ */ p("style", { children: da }),
			/* @__PURE__ */ m("div", {
				className: "cto-top",
				children: [
					/* @__PURE__ */ m("nav", {
						className: "kit-crumb",
						"aria-label": "位置",
						children: [
							t ? /* @__PURE__ */ p("button", {
								type: "button",
								onClick: t,
								children: c
							}) : /* @__PURE__ */ p("span", { children: c }),
							/* @__PURE__ */ p("span", {
								"aria-hidden": "true",
								children: "›"
							}),
							/* @__PURE__ */ p("b", { children: e.key })
						]
					}),
					/* @__PURE__ */ p("span", { className: "cto-grow" }),
					/* @__PURE__ */ m("div", {
						className: "cto-item-act",
						children: [
							/* @__PURE__ */ p("button", {
								type: "button",
								className: "kt-btn is-primary",
								onClick: () => _(),
								children: "需求看板 ↗"
							}),
							u && u.row.state === "merged" && /* @__PURE__ */ p("button", {
								type: "button",
								className: "kt-btn",
								onClick: () => _(!0),
								children: "▶ 回放 ↗"
							}),
							t && /* @__PURE__ */ m("button", {
								type: "button",
								className: "kt-btn",
								onClick: t,
								children: ["← 返回", c]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ p(Y, {
				loading: r.loading,
				error: r.error,
				has: !!u
			}),
			u && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ p(_a, { x: u }),
				/* @__PURE__ */ p(va, {
					x: u,
					board: d,
					onBoard: () => _()
				}),
				(g || a) && /* @__PURE__ */ p(Sa, {
					repo: e.repo,
					reqKey: e.key,
					opened: a,
					onOpened: (e) => {
						s(e), l();
					}
				}),
				/* @__PURE__ */ p(ba, {
					board: d,
					onBoard: () => _()
				}),
				/* @__PURE__ */ p(Ca, {
					x: u,
					sessionUrl: h?.url ?? null
				}),
				/* @__PURE__ */ m("div", {
					className: "br-twocol",
					children: [/* @__PURE__ */ m("div", {
						className: "br-col",
						children: [
							/* @__PURE__ */ p(Ea, {
								decisions: u.decisions,
								repo: e.repo,
								go: n.go
							}),
							/* @__PURE__ */ m("section", {
								className: "cto-card",
								"aria-label": "问题和回答",
								children: [/* @__PURE__ */ m("div", {
									className: "cto-chart-head",
									children: [/* @__PURE__ */ p("h3", { children: "问题和回答" }), /* @__PURE__ */ m("span", {
										className: "cto-dim",
										children: [u.questions.length, " 个 · 能在这里回答的才有回答框"]
									})]
								}), u.questions.length === 0 ? /* @__PURE__ */ p("p", {
									className: "br-empty",
									children: "没有问过人。"
								}) : /* @__PURE__ */ p("div", {
									className: "br-stack",
									children: u.questions.map((t, n) => /* @__PURE__ */ p(lt, {
										q: t,
										repo: e.repo,
										reqKey: e.key,
										onAnswered: l
									}, `${t.id ?? "q"}-${n}`))
								})]
							}),
							/* @__PURE__ */ p(ft, { m: u.mr_desc })
						]
					}), /* @__PURE__ */ m("div", {
						className: "br-col",
						children: [
							/* @__PURE__ */ p(Ta, { x: u }),
							/* @__PURE__ */ p(Aa, {
								sessions: u.sessions,
								total: u.credits.total,
								note: u.credits.note
							}),
							/* @__PURE__ */ p(ja, {
								b: u.brain,
								repo: e.repo,
								go: n.go
							}),
							/* @__PURE__ */ p(Oa, { t: u.timeline })
						]
					})]
				})
			] })
		]
	});
}
function _a({ x: e }) {
	let t = e.row, n = e.run;
	return /* @__PURE__ */ m("section", {
		className: "br-head br-detail-head",
		"aria-label": "需求",
		children: [
			/* @__PURE__ */ m("header", {
				className: "cto-item-head",
				children: [
					/* @__PURE__ */ p("h2", {
						className: "kt-run-title",
						children: t.title
					}),
					/* @__PURE__ */ p("span", {
						className: "kt-pill tone-info kt-mono",
						children: t.key
					}),
					/* @__PURE__ */ p(U, {
						state: t.state,
						label: t.state_label
					}),
					/* @__PURE__ */ m("span", {
						className: "cto-org",
						children: [t.owner ? `${t.owner} 的需求 · ` : "", e.where_label]
					})
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-item-now br-row",
				"data-testid": "detail-waits",
				children: [/* @__PURE__ */ m("span", { children: ["此刻：", t.waits.text || "—"] }), t.waits.line && /* @__PURE__ */ p("code", {
					className: "br-mono br-strong",
					children: t.waits.line
				})]
			}),
			/* @__PURE__ */ m("dl", {
				className: "br-facts br-detail-facts",
				children: [
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "分支" }), /* @__PURE__ */ p("dd", { children: t.branch ? /* @__PURE__ */ p("code", { children: t.branch }) : "—" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "工作目录" }), /* @__PURE__ */ p("dd", { children: t.worktree ? /* @__PURE__ */ p("code", { children: t.worktree }) : "—" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "Lean intent" }), /* @__PURE__ */ p("dd", { children: t.intent ? /* @__PURE__ */ p("code", { children: t.intent }) : "—" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "MR" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ p(ye, { mr: t.mr }) })] }),
					e.claim && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "认领" }), /* @__PURE__ */ m("dd", { children: [
						e.claim.owner ?? "—",
						" · ",
						L(e.claim.created_at),
						" · 来源 ",
						e.claim.source,
						e.claim.closed ? ` · 已关闭：${e.claim.closed}` : ""
					] })] }),
					n && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "运行" }), /* @__PURE__ */ m("dd", { children: [
						"开始于 ",
						L(n.created_at),
						n.origin ? ` · 来源 ${n.origin}` : "",
						n.brain_commit ? /* @__PURE__ */ m(f, { children: [" · Brain ", /* @__PURE__ */ p("code", { children: n.brain_commit })] }) : ""
					] })] }),
					n?.handoff && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "交接" }), /* @__PURE__ */ m("dd", { children: [L(n.handoff.requested_at), n.handoff.by ? ` · ${n.handoff.by}` : ""] })] }),
					n && n.materials.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "材料" }), /* @__PURE__ */ p("dd", {
						className: "br-row",
						children: n.materials.map((e) => /* @__PURE__ */ p("code", { children: e }, e))
					})] }),
					t.run_ids.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "运行机" }), /* @__PURE__ */ p("dd", {
						className: "br-row",
						children: t.run_ids.map((e) => /* @__PURE__ */ p("code", { children: e }, e))
					})] }),
					t.expected_paths.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "要改的地方" }), /* @__PURE__ */ p("dd", {
						className: "br-row",
						children: t.expected_paths.map((e) => /* @__PURE__ */ p("code", { children: e }, e))
					})] }),
					t.overlap.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "重叠" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ m("span", {
						className: "br-chip tone-warn",
						children: [
							"和 ",
							t.overlap.join("、"),
							" 改同一块"
						]
					}) })] })
				]
			})
		]
	});
}
function va({ x: e, board: t, onBoard: n }) {
	let r = t?.at ?? Date.now() / 1e3, i = t?.started_at ?? (e.claim?.created_at ? Date.parse(e.claim.created_at) / 1e3 : null), a = t?.ended_at ?? null, o = e.row.lean, s = t ? ha(t, r) : [], c = [
		"agent",
		"runner",
		"person",
		"rework"
	].map((e) => ({
		p: e,
		s: s.filter((t) => t.part === e).reduce((e, t) => e + t.to - t.from, 0)
	})), l = c.filter((e) => e.p !== "person").reduce((e, t) => e + t.s, 0), u = t ? t.events.filter((e) => e.kind === "reject" || e.kind === "rejected").length : 0, d = t ? t.events.filter((e) => e.kind === "blocked").length : 0, h = t?.checks;
	return /* @__PURE__ */ m("section", {
		className: "cto-cards cto-item-cards",
		"aria-label": "这个需求的四个数",
		children: [
			/* @__PURE__ */ m("article", {
				className: "cto-card",
				"aria-label": "周期",
				children: [
					/* @__PURE__ */ p("div", {
						className: "cto-eyebrow",
						children: "周期"
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-value",
						"data-testid": "item-cycle",
						children: i ? k((a ?? r) - i) : "—"
					}),
					/* @__PURE__ */ m("div", {
						className: "cto-desc",
						children: [i ? `${I(i)} 起` : "还没开工", a ? ` → ${I(a)} 合并` : " → 进行中"]
					}),
					/* @__PURE__ */ p("div", {
						className: "kt-segs cto-segs",
						"aria-label": `Lean ${o.done}/${o.total}`,
						children: Array.from({ length: o.total }, (e, t) => /* @__PURE__ */ p("i", { className: t < o.done ? "is-pass" : o.stage_state === "started" && o.stage_n === t + 1 ? "is-run" : "" }, t))
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-legend",
						children: /* @__PURE__ */ m("span", { children: [
							"Lean 做完 ",
							o.done,
							"/",
							o.total,
							" 个阶段 · 现在 ",
							e.row.stage ?? "还没开始"
						] })
					})
				]
			}),
			/* @__PURE__ */ m("article", {
				className: "cto-card",
				"aria-label": "时间花在哪",
				children: [
					/* @__PURE__ */ p("div", {
						className: "cto-eyebrow",
						children: "时间花在哪"
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-value",
						children: t ? k(l) : "—"
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-desc",
						children: t ? `AI 在做 · 等人 ${k(c.find((e) => e.p === "person").s)}` : "看板的数据还没来"
					}),
					t && /* @__PURE__ */ p(ya, { split: c }),
					t && /* @__PURE__ */ p("div", {
						className: "cto-legend",
						children: c.filter((e) => e.s > 0).map(({ p: e, s: t }) => /* @__PURE__ */ m("button", {
							type: "button",
							onClick: n,
							title: "在需求看板上看",
							children: [
								/* @__PURE__ */ p("i", {
									className: "cto-sw",
									style: { background: pa[e] }
								}),
								fa[e],
								/* @__PURE__ */ p("b", { children: k(t) })
							]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ m("article", {
				className: "cto-card",
				"aria-label": "成本",
				children: [
					/* @__PURE__ */ p("div", {
						className: "cto-eyebrow",
						children: "成本"
					}),
					/* @__PURE__ */ m("div", {
						className: "cto-value",
						children: [M(e.credits.total), /* @__PURE__ */ p("span", {
							className: "cto-of",
							children: "credits"
						})]
					}),
					/* @__PURE__ */ m("div", {
						className: "cto-desc",
						children: [e.sessions.length, " 个会话 · KiroCrew 只报 credits"]
					}),
					/* @__PURE__ */ m("div", {
						className: "cto-chips",
						"aria-label": "会话",
						children: [e.sessions.map((e) => /* @__PURE__ */ p("span", {
							className: `cto-chip${e.error ? " is-back" : e.awaiting ? " is-wait" : ""}`,
							title: `${e.title}：${M(e.credits)} credits`,
							children: /* @__PURE__ */ p(V, {
								role: e.kind === "runner" ? "runner" : "laptop",
								size: 16
							})
						}, e.slot)), e.sessions.length === 0 && /* @__PURE__ */ p("span", {
							className: "cto-chip is-idle",
							children: /* @__PURE__ */ p(V, {
								role: "laptop",
								size: 16
							})
						})]
					})
				]
			}),
			/* @__PURE__ */ m("article", {
				className: `cto-card${h && h.total ? h.failed ? " is-bad" : h.passed === h.total ? " is-ok" : "" : ""}`,
				"aria-label": "检查",
				children: [
					/* @__PURE__ */ p("div", {
						className: "cto-eyebrow",
						children: "检查"
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-value",
						children: h ? /* @__PURE__ */ m(f, { children: [h.passed, /* @__PURE__ */ m("span", {
							className: "cto-of",
							children: ["/", h.total]
						})] }) : "—"
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-desc",
						children: "Lean 审批 · verify · 交接 · Brain"
					}),
					h && /* @__PURE__ */ p("button", {
						type: "button",
						className: "kt-segs cto-segs",
						"aria-label": "在需求看板的检查墙上看每一项",
						onClick: n,
						children: h.cells.filter((e) => e.status !== "skip").map((e) => /* @__PURE__ */ p("i", {
							className: e.status === "pass" ? "is-pass" : e.status === "fail" ? "is-fail" : "is-wait",
							title: e.name
						}, e.id))
					}),
					/* @__PURE__ */ p("div", {
						className: "cto-legend",
						children: /* @__PURE__ */ m("span", { children: [
							/* @__PURE__ */ p(V, {
								role: "bounce",
								size: 14
							}),
							"退回 ",
							u,
							" 次 · Lean 拦下 ",
							d,
							" 次"
						] })
					})
				]
			})
		]
	});
}
function ya({ split: e }) {
	let t = e.filter((e) => e.s > 0), n = t.reduce((e, t) => e + t.s, 0) || 1;
	return /* @__PURE__ */ p($i, {
		label: "时间花在哪：" + t.map((e) => `${fa[e.p]} ${k(e.s)}`).join("，"),
		height: 22,
		children: (e, r) => {
			let i = Math.max(10, e - 8), a = 0;
			return t.map((e, o) => {
				let s = Math.max(2, e.s / n * i - (o < t.length - 1 ? 2 : 0)), c = a;
				return a += e.s / n * i, /* @__PURE__ */ m("g", { children: [/* @__PURE__ */ p("rect", {
					x: c,
					y: 4,
					width: s,
					height: 14,
					rx: o === t.length - 1 ? 4 : 0,
					fill: pa[e.p]
				}), /* @__PURE__ */ p(Zi, {
					x: c,
					y: 0,
					w: Math.max(8, s),
					h: 22,
					onTip: r,
					rows: [[
						k(e.s),
						fa[e.p],
						pa[e.p]
					], [`${Math.round(e.s / n * 100)}%`, "占记下的时间"]]
				})] }, e.p);
			});
		}
	});
}
function ba({ board: e, onBoard: t }) {
	let n = e ? ha(e, e.at) : [];
	return e && n.length ? /* @__PURE__ */ p(xa, {
		board: e,
		segs: n,
		onBoard: t
	}) : null;
}
function xa({ board: e, segs: t, onBoard: n }) {
	let [r, i] = Yi(1100), [a, s] = o(null), c = t[0].from, l = t[t.length - 1].to, u = Math.max(60, l - c), d = Math.max(10, i - 6 - 6), f = (e) => 6 + (Math.min(Math.max(e, c), l) - c) / u * d, h = e.events.filter((e) => [
		"approve",
		"reject",
		"handover",
		"accepted",
		"question",
		"answer",
		"merge",
		"reflect"
	].includes(e.kind)), g = {
		approve: "approved",
		reject: "bounce",
		handover: "handover",
		accepted: "bridge",
		question: "question",
		answer: "person",
		merge: "merge",
		reflect: "brain"
	};
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "价值流",
		"data-testid": "item-stream",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "价值流" }), /* @__PURE__ */ m("span", {
					className: "cto-dim",
					children: [
						"从开工到",
						e.ended_at ? "合并" : "此刻",
						"，记下的 ",
						k(t.reduce((e, t) => e + t.to - t.from, 0)),
						" · 安静的时段没画 · 点任一段到需求看板"
					]
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-legend",
				children: [[
					"agent",
					"runner",
					"person",
					"rework"
				].map((e) => /* @__PURE__ */ m("span", { children: [/* @__PURE__ */ p("i", {
					className: "cto-sw",
					style: { background: pa[e] }
				}), fa[e]] }, e)), /* @__PURE__ */ p("span", {
					className: "cto-dim",
					children: "· 色块下方是关键时刻"
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-vs",
				ref: r,
				children: [/* @__PURE__ */ m("svg", {
					viewBox: `0 0 ${i} 112`,
					height: 112,
					role: "img",
					"aria-label": "价值流：" + t.map((e) => `${fa[e.part]} ${k(e.to - e.from)}`).join("，"),
					children: [t.map((e, r) => {
						let i = f(e.from), a = f(e.to), o = Math.max(2, a - i - 2);
						return /* @__PURE__ */ m("g", {
							className: "cto-vs-seg",
							children: [
								/* @__PURE__ */ p("rect", {
									x: i,
									y: 18,
									width: o,
									height: 26,
									rx: r === 0 || r === t.length - 1 ? 5 : 2,
									fill: pa[e.part]
								}),
								o > 70 && /* @__PURE__ */ p("text", {
									x: i + 4,
									y: 60,
									className: "is-strong",
									children: fa[e.part]
								}),
								o > 70 && /* @__PURE__ */ p("text", {
									x: i + 4,
									y: 74,
									children: k(e.to - e.from)
								}),
								/* @__PURE__ */ p(Zi, {
									x: i,
									y: 14,
									w: Math.max(8, o),
									h: 34,
									onTip: s,
									onPick: n,
									label: `${fa[e.part]} ${k(e.to - e.from)}`,
									when: `${I(e.from)} – ${I(e.to)}`,
									rows: [[
										k(e.to - e.from),
										fa[e.part],
										pa[e.part]
									], ["点击", "到需求看板"]]
								})
							]
						}, r);
					}), h.map((e) => /* @__PURE__ */ m("g", {
						className: `cto-vs-moment ${e.kind === "reject" ? "is-back" : e.kind === "question" ? "is-wait" : "is-ok"}`,
						transform: `translate(${f(e.at)},96)`,
						children: [
							/* @__PURE__ */ p("title", { children: `${I(e.at)} · ${e.text}` }),
							/* @__PURE__ */ p("circle", { r: 9 }),
							/* @__PURE__ */ p(se, {
								role: g[e.kind],
								cx: 0,
								cy: 0,
								size: 12
							})
						]
					}, e.seq))]
				}), /* @__PURE__ */ p(Xi, {
					tip: a,
					width: i
				})]
			})
		]
	});
}
function Sa({ repo: e, reqKey: t, opened: n, onOpened: r }) {
	let i = c(), a = u(), [s, l] = o(!0), [d, h] = o(!0), g = O((n) => i.post(w.session(e, t), n)), _ = async () => {
		let e = await g.run({
			trust: s,
			kickoff: d
		});
		e && r(e);
	};
	return /* @__PURE__ */ m("section", {
		className: "cto-card is-wait br-opensession",
		"aria-label": "开会话",
		children: [n ? /* @__PURE__ */ m("div", {
			className: "br-row",
			children: [/* @__PURE__ */ p("span", {
				className: "br-ok-text",
				children: "会话开好了。"
			}), /* @__PURE__ */ m("button", {
				type: "button",
				className: "kt-btn is-primary",
				onClick: () => a(n.url),
				children: [/* @__PURE__ */ p(H, {
					name: "MessageSquare",
					size: 13
				}), "打开会话"]
			})]
		}) : /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ p("h3", { children: "还没有会话" }), /* @__PURE__ */ p("span", {
				className: "cto-dim",
				children: "在这个需求的工作目录里开一个 brain-dev 会话，接着做。"
			})]
		}), /* @__PURE__ */ m("div", {
			className: "br-row",
			children: [
				/* @__PURE__ */ m("label", {
					className: "br-check",
					children: [/* @__PURE__ */ p("input", {
						type: "checkbox",
						checked: s,
						onChange: (e) => l(e.target.checked)
					}), /* @__PURE__ */ p("span", { children: "这个会话的工具调用不用逐个批准" })]
				}),
				/* @__PURE__ */ m("label", {
					className: "br-check",
					children: [/* @__PURE__ */ p("input", {
						type: "checkbox",
						checked: d,
						onChange: (e) => h(e.target.checked)
					}), /* @__PURE__ */ p("span", { children: "开好后先发一句开场，让它接着做" })]
				}),
				/* @__PURE__ */ p("span", { className: "br-grow" }),
				/* @__PURE__ */ p("button", {
					type: "button",
					className: "kt-btn is-primary",
					disabled: g.busy,
					onClick: () => void _(),
					children: g.busy ? "正在开…" : "开会话"
				})
			]
		})] }), g.error && /* @__PURE__ */ p("p", {
			className: "br-error",
			role: "alert",
			children: g.error
		})]
	});
}
function Ca({ x: e, sessionUrl: t }) {
	let { stages: n, approvals: r } = e.lean;
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "Lean 进度",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "AI-DLC Lean" }), /* @__PURE__ */ m("span", {
					className: "cto-dim",
					children: [
						"做完或跳过 ",
						e.row.lean.done,
						"/",
						e.row.lean.total,
						" 个阶段 · 审批的那一行由你在会话里自己打，app 不替你发"
					]
				})]
			}),
			/* @__PURE__ */ p("ol", {
				className: "br-stagecells",
				"aria-label": "11 个阶段",
				children: n.map((e) => /* @__PURE__ */ p(wa, { s: e }, e.id))
			}),
			/* @__PURE__ */ p("h3", {
				style: { marginTop: 4 },
				children: "审批"
			}),
			r.length === 0 ? /* @__PURE__ */ p("p", {
				className: "br-empty",
				children: "还没有审批。"
			}) : /* @__PURE__ */ p("ul", {
				className: "br-approvals",
				"aria-label": "审批",
				children: r.map((e, n) => {
					let r = fe[e.state] ?? {
						label: e.state,
						tone: "idle"
					};
					return /* @__PURE__ */ m("li", {
						className: "br-approval",
						"data-testid": "approval",
						"data-state": e.state,
						children: [/* @__PURE__ */ m("div", {
							className: "br-row",
							children: [
								/* @__PURE__ */ p(V, {
									role: e.kind === "RELEASE" ? "release" : e.kind === "REQUIREMENTS" ? "req" : "design",
									size: 16
								}),
								/* @__PURE__ */ p("b", {
									className: "br-mono",
									children: e.kind
								}),
								/* @__PURE__ */ p("span", {
									className: `br-chip tone-${r.tone}`,
									children: r.label
								}),
								e.sha8 && /* @__PURE__ */ p("code", {
									className: "br-dim",
									children: e.sha8
								}),
								e.at !== null && /* @__PURE__ */ p("span", {
									className: "br-dim br-small",
									children: I(e.at)
								}),
								e.path && /* @__PURE__ */ p("code", {
									className: "br-dim br-small",
									children: e.path
								})
							]
						}), e.state === "pending" && e.line && /* @__PURE__ */ p(q, {
							line: e.line,
							sessionUrl: t
						})]
					}, `${e.kind}-${e.sha8 ?? n}`);
				})
			})
		]
	});
}
function wa({ s: e }) {
	let t = pe[e.state] ?? pe.todo;
	return /* @__PURE__ */ m("li", {
		className: `br-stagecell is-${e.state} tone-${t.tone === "wait" ? "approve" : t.tone}`,
		"data-testid": "stage",
		"data-state": e.state,
		title: e.note ?? t.label,
		children: [
			/* @__PURE__ */ m("span", {
				className: "br-stage-n",
				children: [
					e.n,
					" · ",
					t.label
				]
			}),
			/* @__PURE__ */ m("span", {
				className: "br-stage-label",
				children: [e.label, /* @__PURE__ */ m("span", {
					className: "br-sr",
					children: [
						"（",
						t.label,
						"）"
					]
				})]
			}),
			e.units.length > 0 && /* @__PURE__ */ p("span", {
				className: "br-stage-units",
				children: e.units.map((e) => {
					let t = pe[e.state] ?? pe.todo;
					return /* @__PURE__ */ m("span", {
						className: `br-chip tone-${t.tone}`,
						title: t.label,
						children: [
							e.unit,
							" · ",
							t.label
						]
					}, e.unit);
				})
			})
		]
	});
}
function Ta({ x: e }) {
	let { status: t, next: n, open_questions: r } = e.lean;
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "会话记录",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "会话记录" }), /* @__PURE__ */ p("span", {
					className: "cto-dim",
					children: "aidlc-state.md 的 Session notes"
				})]
			}),
			t ? /* @__PURE__ */ p("p", {
				className: "br-pre br-strong",
				style: { margin: 0 },
				children: t
			}) : /* @__PURE__ */ p("p", {
				className: "br-empty",
				children: "还没有写。"
			}),
			n.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", {
				className: "br-strong",
				children: "下一步"
			}), /* @__PURE__ */ p("ul", {
				className: "br-list",
				children: n.map((e, t) => /* @__PURE__ */ p("li", { children: e }, t))
			})] }),
			r.length > 0 && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", {
				className: "br-strong",
				children: "没解决的问题"
			}), /* @__PURE__ */ p("ul", {
				className: "br-list",
				children: r.map((e, t) => /* @__PURE__ */ p("li", { children: e }, t))
			})] })
		]
	});
}
function Ea({ decisions: e, repo: t, go: n }) {
	let r = e.filter((e) => e.by === "person").length;
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "决定",
		children: [/* @__PURE__ */ m("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ p("h3", { children: "决定" }), /* @__PURE__ */ m("span", {
				className: "cto-dim",
				children: [
					"decisions.md · ",
					e.length,
					" 条 · 人定了 ",
					r,
					" 条 · 引用的 Brain 条目点开看"
				]
			})]
		}), e.length === 0 ? /* @__PURE__ */ p("p", {
			className: "br-empty",
			children: "还没有记下决定。"
		}) : /* @__PURE__ */ p("div", {
			className: "br-scroll",
			children: /* @__PURE__ */ m("table", {
				className: "cto-table",
				children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
					/* @__PURE__ */ p("th", { children: "ID" }),
					/* @__PURE__ */ p("th", { children: "日期" }),
					/* @__PURE__ */ p("th", { children: "阶段" }),
					/* @__PURE__ */ p("th", { children: "决定" }),
					/* @__PURE__ */ p("th", { children: "为什么" }),
					/* @__PURE__ */ p("th", { children: "谁定的" }),
					/* @__PURE__ */ p("th", { children: "引用 Brain" }),
					/* @__PURE__ */ p("th", { children: "凭证" })
				] }) }), /* @__PURE__ */ p("tbody", { children: e.map((e) => /* @__PURE__ */ m("tr", { children: [
					/* @__PURE__ */ p("td", {
						className: "br-key",
						title: e.src,
						children: e.id
					}),
					/* @__PURE__ */ p("td", {
						className: "br-dim",
						style: { whiteSpace: "nowrap" },
						children: e.date ?? "—"
					}),
					/* @__PURE__ */ p("td", {
						className: "br-dim",
						children: e.stage ?? "—"
					}),
					/* @__PURE__ */ p("td", {
						className: "br-pre",
						children: e.text
					}),
					/* @__PURE__ */ p("td", {
						className: "br-pre br-dim",
						children: e.why ?? "—"
					}),
					/* @__PURE__ */ p("td", {
						title: e.by === "unclassified" ? "Who 不是规定的写法：没归类，也不猜是谁" : void 0,
						children: [e.who, e.by ? la[e.by] : null].filter(Boolean).join(" · ") || "—"
					}),
					/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p("span", {
						className: "br-row",
						style: { gap: 4 },
						children: e.cites.length ? e.cites.map((e) => /* @__PURE__ */ p(ct, {
							id: e,
							repo: t,
							go: n
						}, e)) : /* @__PURE__ */ p("span", {
							className: "br-dim",
							children: "—"
						})
					}) }),
					/* @__PURE__ */ p("td", { children: e.vouchers.length ? e.vouchers.map((e) => /* @__PURE__ */ m("code", { children: [e, " "] }, e)) : /* @__PURE__ */ p("span", {
						className: "br-dim",
						children: "—"
					}) })
				] }, e.id)) })]
			})
		})]
	});
}
function Da(e) {
	if (!e) return "—";
	let t = L(e);
	return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? t.slice(11) : "—";
}
function Oa({ t: e }) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e.items) {
		let e = R(n.at) ?? "没有时间";
		t.set(e, [...t.get(e) ?? [], n]);
	}
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "时间线",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "时间线" }), /* @__PURE__ */ p("span", {
					className: "cto-dim",
					children: e.source === "trace" ? "来自 brain-kit trace" : "app 自己拼的（brain-kit 没有 trace）"
				})]
			}),
			e.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: e.error
			}),
			/* @__PURE__ */ p("div", {
				className: "br-tlbox",
				children: e.items.length === 0 ? /* @__PURE__ */ p("p", {
					className: "br-empty",
					children: "还没有记录。"
				}) : [...t.entries()].map(([e, t]) => /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("p", {
					className: "br-day",
					children: e
				}), /* @__PURE__ */ p("ol", {
					className: "br-tl",
					children: t.map((e, t) => {
						let n = ua[e.kind] ?? {
							icon: "commit",
							label: e.kind
						};
						return /* @__PURE__ */ m("li", {
							"data-testid": "tl-item",
							"data-kind": e.kind,
							children: [
								/* @__PURE__ */ p("time", { children: Da(e.at) }),
								/* @__PURE__ */ m("span", {
									title: n.label,
									children: [/* @__PURE__ */ p(V, {
										role: n.icon,
										size: 16
									}), /* @__PURE__ */ p("span", {
										className: "br-sr",
										children: n.label
									})]
								}),
								/* @__PURE__ */ m("span", { children: [
									/* @__PURE__ */ p("span", {
										className: "br-strong",
										children: e.label
									}),
									e.detail && /* @__PURE__ */ m("span", {
										className: "br-dim",
										children: [" · ", e.detail]
									}),
									e.who && /* @__PURE__ */ m("span", {
										className: "br-dim br-small",
										children: [" · ", e.who]
									})
								] })
							]
						}, t);
					})
				})] }, e))
			}),
			e.missing.length > 0 && /* @__PURE__ */ m("p", {
				className: "br-note br-small",
				children: ["这些来源没读到：", e.missing.join("、")]
			})
		]
	});
}
function ka(e) {
	return e.error ? {
		label: "出错",
		tone: "bad"
	} : e.awaiting ? {
		label: "等批准",
		tone: "wait"
	} : e.busy ? {
		label: "在忙",
		tone: "run"
	} : {
		label: "空闲",
		tone: "idle"
	};
}
function Aa({ sessions: e, total: t, note: n }) {
	let r = u(), i = Date.now() / 1e3;
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "会话",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "会话" }), /* @__PURE__ */ m("span", {
					className: "cto-dim",
					children: [
						"这个 app 开的 · 合计 ",
						M(t),
						" credits"
					]
				})]
			}),
			e.length === 0 ? /* @__PURE__ */ p("p", {
				className: "br-empty",
				children: "还没有会话。"
			}) : /* @__PURE__ */ p("ul", {
				className: "br-sessions",
				children: e.map((e) => {
					let t = ka(e);
					return /* @__PURE__ */ m("li", {
						className: "br-session",
						"data-testid": "session",
						children: [
							/* @__PURE__ */ p(V, {
								role: e.kind === "runner" ? "runner" : "laptop",
								size: 22
							}),
							/* @__PURE__ */ m("div", {
								className: "br-stack",
								style: { gap: 2 },
								children: [
									/* @__PURE__ */ m("div", {
										className: "br-row",
										children: [
											/* @__PURE__ */ p("b", {
												className: "br-strong",
												children: e.title
											}),
											/* @__PURE__ */ p("span", {
												className: `br-chip tone-${t.tone}`,
												children: t.label
											}),
											/* @__PURE__ */ p("span", {
												className: "br-tag",
												children: e.kind === "local" ? "本机" : "运行机"
											})
										]
									}),
									/* @__PURE__ */ m("div", {
										className: "br-row br-small br-dim",
										children: [
											/* @__PURE__ */ p("code", { children: e.agent }),
											/* @__PURE__ */ m("span", { children: ["credits ", M(e.credits)] }),
											/* @__PURE__ */ m("span", { children: [e.turns, " 轮"] }),
											/* @__PURE__ */ m("span", { children: ["最近 ", j(e.last_activity, i)] })
										]
									}),
									e.error && /* @__PURE__ */ p("p", {
										className: "br-error br-small",
										children: e.error
									})
								]
							}),
							/* @__PURE__ */ m("button", {
								type: "button",
								className: "kt-btn is-small",
								onClick: () => r(e.url),
								children: [/* @__PURE__ */ p(H, {
									name: "MessageSquare",
									size: 13
								}), "打开会话"]
							})
						]
					}, e.slot);
				})
			}),
			n && /* @__PURE__ */ p("p", {
				className: "br-hint",
				children: n
			})
		]
	});
}
function ja({ b: e, repo: t, go: n }) {
	return /* @__PURE__ */ m("section", {
		className: "cto-card",
		"aria-label": "用到的 Brain",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ p("h3", { children: "用到的 Brain" }), /* @__PURE__ */ p("span", {
					className: "cto-dim",
					children: "开工时带进来的、决定里引用的"
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ m("span", {
						className: "kt-pill tone-info",
						children: [
							"载入 ",
							e.loaded ?? "—",
							" 条"
						]
					}),
					/* @__PURE__ */ m("span", {
						className: "kt-pill tone-ok",
						children: [
							"引用 ",
							e.cited.length,
							" 条"
						]
					}),
					e.proposals !== null && /* @__PURE__ */ m("span", {
						className: "kt-pill tone-handoff",
						children: [
							"提议 ",
							e.proposals,
							" 条新知识"
						]
					})
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-row",
				"aria-label": "引用",
				children: [/* @__PURE__ */ p("span", {
					className: "br-dim br-small",
					children: "引用"
				}), e.cited.length ? e.cited.map((e) => /* @__PURE__ */ p(ct, {
					id: e,
					repo: t,
					go: n
				}, e)) : /* @__PURE__ */ p("span", {
					className: "br-dim",
					children: "—"
				})]
			}),
			e.stale.length > 0 && /* @__PURE__ */ m("div", {
				className: "br-row",
				"aria-label": "过时",
				children: [/* @__PURE__ */ p("span", {
					className: "br-warn-text br-small",
					children: "标成过时"
				}), e.stale.map((e) => /* @__PURE__ */ p(ct, {
					id: e,
					repo: t,
					go: n
				}, e))]
			}),
			e.unknown.length > 0 && /* @__PURE__ */ m("div", {
				className: "br-row",
				"aria-label": "不认识",
				children: [/* @__PURE__ */ p("span", {
					className: "br-bad-text br-small",
					children: "Brain 里没有"
				}), e.unknown.map((e) => /* @__PURE__ */ p("span", {
					className: "br-tag br-mono",
					children: e
				}, e))]
			})
		]
	});
}
//#endregion
//#region src/views/Import.tsx
var Ma = "把一个项目仓库导进来：先只读地检查它；没装 brain-kit 的，直接装在当前分支并提交（团队仓库也可以装到新分支、开 MR）；最后加入列表，交付总览和开需求就能用它了。", Na = {
	OK: "✓",
	WARN: "!",
	FAIL: "✗"
}, Pa = {
	added: "新增",
	modified: "改动",
	deleted: "删除",
	other: "其他"
}, Fa = {
	added: "ok",
	modified: "warn",
	deleted: "bad",
	other: "idle"
}, Ia = [
	"added",
	"modified",
	"deleted",
	"other"
], La = {
	req_prefix: "",
	tracker: "none",
	jira_base: "",
	gitlab_base: "",
	gitlab_project: "",
	default_branch: "main",
	team: ""
};
function Ra(e) {
	let t = e.trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
	return t.endsWith(".git") ? t.slice(0, -4) : t;
}
function za({ entry: e, go: n, setStatus: r, reloadStatus: i, pollMs: a }) {
	let s = c(), l = Math.min(a ?? 1e3, ne), u = D(w.importDefaults(), 0), [d, f] = o("local"), [h, g] = o(e.path ?? ""), [_, v] = o(null), [y, b] = o(""), x = O((e) => s.post(w.importInspect(), { path: e })), S = t(async (e) => {
		let t = await x.run(e);
		t && v({
			path: e,
			result: t
		});
	}, [x]), C = z(l, (e) => {
		i(), e.state === "done" && e.result?.commit.ok && _ && S(_.path);
	}), T = _?.result ?? null, E = !!_ && d === "local" && h.trim() !== _.path, k = T && !E ? T : null, A = C.job && T?.path && C.job.target === T.path ? C.job : null, j = () => _ && void S(_.path), M = (() => {
		if (k && k.next !== "fix") return A && A.state === "done" && A.result?.commit.ok ? "done" : k.next === "add" || k.next === "listed" && !k.pending ? "off" : k.next === "pending" || k.next === "listed" ? k.pending?.state === "uncommitted" ? "wait" : "done" : !A || A.state === "running" ? "now" : A.state === "failed" ? "bad" : A.result?.commit.ok ? "done" : "wait";
	})(), N = !k || k.next === "fix" || k.next === "install" ? void 0 : k.next === "listed" || k.path && y === k.path ? "done" : "now", P = [
		k ? "done" : "now",
		k ? k.next === "fix" ? "bad" : "done" : x.busy ? "now" : void 0,
		M,
		N
	], F = Ie.map((e, t) => ({
		...e,
		state: P[t],
		...t === 2 && M === "off" ? { text: "已经装了：不用装" } : {}
	}));
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view imp-root",
		"data-testid": "br-import",
		children: [
			/* @__PURE__ */ p("style", { children: no }),
			/* @__PURE__ */ m("section", {
				className: "br-hero imp-hero",
				"aria-label": "导入仓库",
				children: [/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("h2", { children: "导入仓库" }), /* @__PURE__ */ p("p", { children: Ma })] }), /* @__PURE__ */ p(He, {
					steps: F,
					label: "导入的步骤"
				})]
			}),
			/* @__PURE__ */ m("section", {
				className: "br-card imp-sec",
				"aria-label": "从哪来",
				children: [
					/* @__PURE__ */ p(Ba, {
						n: 1,
						title: "从哪来",
						state: P[0],
						sub: "这台机器上的目录，或者从 GitLab 克隆"
					}),
					/* @__PURE__ */ m("div", {
						className: "imp-options",
						role: "radiogroup",
						"aria-label": "从哪来",
						children: [/* @__PURE__ */ p(Va, {
							value: "local",
							on: d === "local",
							icon: "laptop",
							title: "本机目录",
							text: "这台机器上的检出；子目录、工作区也行",
							onPick: () => f("local")
						}), /* @__PURE__ */ p(Va, {
							value: "clone",
							on: d === "clone",
							icon: "clone",
							title: "克隆（git 地址）",
							text: "先克隆到本机，再检查",
							onPick: () => f("clone")
						})]
					}),
					d === "local" ? /* @__PURE__ */ m("form", {
						className: "imp-local",
						"aria-label": "本机目录",
						onSubmit: (e) => {
							e.preventDefault(), S(h.trim());
						},
						children: [/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ p("label", {
									htmlFor: "imp-path",
									children: "仓库目录"
								}),
								/* @__PURE__ */ m("div", {
									className: "imp-inline",
									children: [/* @__PURE__ */ p("input", {
										id: "imp-path",
										type: "text",
										className: "br-mono",
										value: h,
										placeholder: "~/workplace/shop-pay",
										onChange: (e) => g(e.target.value)
									}), /* @__PURE__ */ m("button", {
										type: "submit",
										className: "br-btn is-primary is-big",
										disabled: !h.trim() || x.busy,
										children: [/* @__PURE__ */ p(V, {
											role: "lint",
											size: 17
										}), x.busy ? "正在检查…" : "检查"]
									})]
								}),
								/* @__PURE__ */ p("p", {
									className: "br-hint",
									children: "写绝对路径。仓库里的子目录、工作区也行：会找到仓库本身。只读，什么都不改。"
								})
							]
						}), E && /* @__PURE__ */ m("p", {
							className: "imp-stale",
							role: "status",
							children: [/* @__PURE__ */ p("i", {
								"aria-hidden": "true",
								children: "!"
							}), "目录改过了：再检查一遍。"]
						})]
					}) : /* @__PURE__ */ p(Ha, {
						defaults: u.data,
						ms: l,
						onCloned: (e) => {
							g(e), S(e);
						}
					}),
					x.error && /* @__PURE__ */ p("p", {
						className: "br-error",
						role: "alert",
						children: x.error
					})
				]
			}),
			k && /* @__PURE__ */ p(Ka, {
				c: k,
				busy: x.busy,
				state: P[1],
				onRecheck: j,
				onFixed: () => {
					i(), j();
				}
			}),
			k && (k.next === "install" || A) && /* @__PURE__ */ p(Ja, {
				c: k,
				job: A,
				state: M,
				readError: C.readError,
				onStart: C.start,
				onCommitted: j
			}, `install:${k.path}`),
			k && (k.next === "pending" || k.next === "listed") && k.pending && k.path && /* @__PURE__ */ p(Qa, {
				path: k.path,
				p: k.pending,
				title: A ? "下一步" : void 0,
				onChanged: () => {
					i(), j();
				}
			}, `pending:${k.path}`),
			k && k.next === "listed" && /* @__PURE__ */ m("section", {
				className: "br-card imp-sec is-ok",
				"aria-label": "加入列表",
				children: [/* @__PURE__ */ p(Ba, {
					n: 4,
					title: "加入列表",
					state: "done"
				}), /* @__PURE__ */ m("div", {
					className: "imp-done",
					role: "status",
					"data-testid": "next-listed",
					children: [
						/* @__PURE__ */ p("span", {
							className: "imp-mark",
							"aria-hidden": "true",
							children: "✓"
						}),
						/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ m("b", { children: [
							"已经在列表里（",
							k.listed,
							"）。"
						] }), /* @__PURE__ */ p("small", { children: k.pending ? k.pending.next : "交付总览、开需求都能用它。" })] }),
						/* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn",
							onClick: () => n({ kind: "overview" }),
							children: [/* @__PURE__ */ p(V, {
								role: "list",
								size: 16
							}), "去交付总览"]
						})
					]
				})]
			}),
			k && (k.next === "add" || k.next === "pending") && k.path && /* @__PURE__ */ p(to, {
				path: k.path,
				pending: k.next === "pending" ? k.pending : null,
				state: N,
				onAdded: (e) => {
					b(k.path ?? ""), r(e.status);
				},
				go: n
			}, `add:${k.path}`)
		]
	});
}
function Ba({ n: e, title: t, state: n, sub: r, children: i }) {
	return /* @__PURE__ */ m("header", {
		className: "imp-head",
		"data-step": e,
		"data-state": n,
		children: [
			/* @__PURE__ */ p("span", {
				className: `imp-n${n ? ` is-${n}` : ""}`,
				"aria-hidden": "true",
				children: n === "done" ? "✓" : e
			}),
			/* @__PURE__ */ p("h3", { children: t }),
			r && /* @__PURE__ */ p("small", { children: r }),
			i
		]
	});
}
function Va({ value: e, on: t, icon: n, title: r, text: i, onPick: a }) {
	let o = `imp-src-${e}`;
	return /* @__PURE__ */ m("label", {
		className: `imp-option${t ? " is-on" : ""}`,
		"data-source": e,
		children: [
			/* @__PURE__ */ p("input", {
				type: "radio",
				name: "imp-source",
				value: e,
				checked: t,
				onChange: a,
				"aria-labelledby": `${o}-t`,
				"aria-describedby": `${o}-d`
			}),
			/* @__PURE__ */ p(V, {
				role: n,
				size: 30
			}),
			/* @__PURE__ */ p("b", {
				id: `${o}-t`,
				children: r
			}),
			/* @__PURE__ */ p("small", {
				id: `${o}-d`,
				children: i
			}),
			/* @__PURE__ */ p("span", {
				className: "imp-tick",
				"aria-hidden": "true",
				children: t ? "✓" : ""
			})
		]
	});
}
function Ha({ defaults: e, ms: t, onCloned: n }) {
	let r = c(), [i, a] = o(""), [s, l] = o(null), [u, d] = o(""), f = O((e) => r.post(w.importClone(), e)), h = z(t, (e) => {
		e.state === "done" && e.result?.path && n(e.result.path);
	}), g = s ?? e?.clone_parent ?? "", _ = h.job?.state === "running", v = async () => {
		let e = await f.run({
			url: i.trim(),
			parent: g.trim(),
			name: u.trim()
		});
		e && h.start(e.job);
	};
	return /* @__PURE__ */ m("form", {
		className: "imp-clone",
		"aria-label": "克隆",
		onSubmit: (e) => {
			e.preventDefault(), v();
		},
		children: [
			/* @__PURE__ */ m("div", {
				className: "imp-grid",
				children: [
					/* @__PURE__ */ m("div", {
						className: "br-field is-full",
						children: [
							/* @__PURE__ */ p("label", {
								htmlFor: "imp-url",
								children: "仓库地址"
							}),
							/* @__PURE__ */ p("input", {
								id: "imp-url",
								type: "text",
								className: "br-mono",
								value: i,
								placeholder: "git@gitlab.example.com:组/仓库.git",
								onChange: (e) => a(e.target.value)
							}),
							/* @__PURE__ */ p("p", {
								className: "br-hint",
								children: "SSH 或 https 地址。别把密码或 token 写进地址：这里不会弹窗问密码。"
							})
						]
					}),
					/* @__PURE__ */ m("div", {
						className: "br-field",
						children: [
							/* @__PURE__ */ p("label", {
								htmlFor: "imp-parent",
								children: "放在哪个目录下"
							}),
							/* @__PURE__ */ p("input", {
								id: "imp-parent",
								type: "text",
								className: "br-mono",
								value: g,
								onChange: (e) => l(e.target.value)
							}),
							/* @__PURE__ */ m("p", {
								className: "br-hint",
								children: [
									"别放进每个需求的工作目录",
									e?.work_root ? `（${e.work_root}）` : "",
									"里面。"
								]
							})
						]
					}),
					/* @__PURE__ */ m("div", {
						className: "br-field",
						children: [/* @__PURE__ */ p("label", {
							htmlFor: "imp-name",
							children: "目录名（可不填）"
						}), /* @__PURE__ */ p("input", {
							id: "imp-name",
							type: "text",
							className: "br-mono",
							value: u,
							placeholder: Ra(i) || "shop-pay",
							onChange: (e) => d(e.target.value)
						})]
					})
				]
			}),
			/* @__PURE__ */ p("div", {
				className: "br-row",
				children: /* @__PURE__ */ m("button", {
					type: "submit",
					className: "br-btn is-primary is-big",
					disabled: !i.trim() || f.busy || _,
					children: [/* @__PURE__ */ p(V, {
						role: "clone",
						size: 17
					}), _ ? "正在克隆…" : "克隆"]
				})
			}),
			f.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: f.error
			}),
			h.job && /* @__PURE__ */ p(Ua, {
				job: h.job,
				what: "克隆",
				readError: h.readError
			}),
			h.job?.state === "done" && h.job.result?.path && /* @__PURE__ */ m("p", {
				className: "br-ok-text",
				role: "status",
				children: [
					"克隆好了：",
					h.job.result.path,
					"。下面是它的检查。"
				]
			})
		]
	});
}
function Ua({ job: e, what: t, readError: n }) {
	let r = e.state === "running", i = e.steps.some((e) => e.state === "fail"), [a, o, s] = r ? [
		"run",
		"●",
		`正在${t}`
	] : e.state === "failed" ? [
		"bad",
		"✕",
		`${t}没成`
	] : i ? [
		"warn",
		"!",
		"有一步没成"
	] : [
		"ok",
		"✓",
		`${t}好了`
	], c = (e.ended_at ?? Date.now() / 1e3) - e.started_at, l = c < 1 ? "不到 1 秒" : k(c);
	return /* @__PURE__ */ m("div", {
		className: `imp-job tone-${a}`,
		role: "group",
		"aria-label": `${t}的进度`,
		"data-job": e.kind,
		children: [
			/* @__PURE__ */ m("div", {
				className: "imp-job-head",
				children: [/* @__PURE__ */ m("span", {
					className: `br-chip kt-pill tone-${a}${r ? " is-live" : ""}`,
					children: [/* @__PURE__ */ p("i", {
						"aria-hidden": "true",
						children: o
					}), s]
				}), /* @__PURE__ */ p("span", {
					className: "imp-elapsed",
					"data-testid": `elapsed-${e.kind}`,
					children: r ? `已经 ${l}` : `用了 ${l}`
				})]
			}),
			/* @__PURE__ */ p(Oe, { job: e }),
			n && /* @__PURE__ */ p("p", {
				className: "br-note",
				role: "status",
				children: n
			})
		]
	});
}
function Wa({ rows: e }) {
	return /* @__PURE__ */ p("ul", {
		className: "imp-checks",
		"data-testid": "import-checks",
		children: e.map((e) => /* @__PURE__ */ m("li", {
			className: `imp-check is-${e.level}`,
			"data-check": e.id,
			"data-level": e.level,
			children: [
				/* @__PURE__ */ p("span", {
					className: `imp-glyph tone-${W[e.level]}`,
					role: "img",
					"aria-label": G[e.level],
					children: Na[e.level]
				}),
				/* @__PURE__ */ m("span", {
					className: "imp-check-main",
					children: [/* @__PURE__ */ p("b", { children: e.label }), /* @__PURE__ */ p("span", {
						className: "br-pre",
						children: e.why
					})]
				}),
				e.todo && /* @__PURE__ */ m("span", {
					className: "imp-todo",
					children: [/* @__PURE__ */ p("b", { children: "做什么" }), e.todo]
				})
			]
		}, e.id))
	});
}
function Ga({ levels: e }) {
	let t = (t) => e.filter((e) => e === t).length;
	return /* @__PURE__ */ p("span", {
		className: "imp-counts",
		children: [
			"OK",
			"WARN",
			"FAIL"
		].filter((e) => t(e) > 0).map((e) => /* @__PURE__ */ m("span", {
			className: `br-chip kt-pill tone-${W[e]}`,
			"data-count": e,
			children: [
				/* @__PURE__ */ p("i", {
					"aria-hidden": "true",
					children: Na[e]
				}),
				t(e),
				/* @__PURE__ */ m("span", {
					className: "br-sr",
					children: [" 项", G[e]]
				})
			]
		}, e))
	});
}
function Ka({ c: e, busy: t, state: n, onRecheck: r, onFixed: i }) {
	return /* @__PURE__ */ m("section", {
		className: `br-card imp-sec${e.next === "fix" ? " is-bad" : ""}`,
		"aria-label": "检查",
		"data-testid": "inspect",
		children: [
			/* @__PURE__ */ m(Ba, {
				n: 2,
				title: "检查",
				state: n,
				children: [
					e.path && /* @__PURE__ */ p("code", {
						className: "imp-path",
						children: e.path
					}),
					/* @__PURE__ */ p(Ga, { levels: e.checks.map((e) => e.level) }),
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small imp-end",
						disabled: t,
						onClick: r,
						children: [/* @__PURE__ */ p(H, {
							name: "RefreshCw",
							size: 13
						}), t ? "正在检查…" : "再检查一遍"]
					})
				]
			}),
			e.note && /* @__PURE__ */ p("p", {
				className: "br-hint",
				children: e.note
			}),
			e.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: e.error
			}),
			/* @__PURE__ */ p(Wa, { rows: e.checks }),
			e.me?.ask && e.path && /* @__PURE__ */ p(Ve, {
				path: e.path,
				me: e.me,
				onSaved: i
			}, e.path),
			e.crew.rows.length > 0 && /* @__PURE__ */ m("div", {
				className: "imp-block",
				children: [/* @__PURE__ */ m("div", {
					className: "imp-block-head",
					children: [
						/* @__PURE__ */ p(V, {
							role: "settings",
							size: 18
						}),
						/* @__PURE__ */ p("b", { children: "KiroCrew" }),
						/* @__PURE__ */ p(Ga, { levels: e.crew.rows.map((e) => e.level) })
					]
				}), /* @__PURE__ */ p(Te, {
					rows: e.crew.rows,
					fix: e.crew.fix,
					onFixed: i
				})]
			}),
			e.next === "fix" && /* @__PURE__ */ m("div", {
				className: "imp-verdict",
				"data-testid": "next-fix",
				children: [/* @__PURE__ */ p(V, {
					role: "blocked",
					size: 20
				}), /* @__PURE__ */ p("b", { children: "先处理上面打 ✗ 的几行，再检查一遍。" })]
			})
		]
	});
}
function qa({ k: e }) {
	let t = e.req_prefix.trim().toUpperCase(), n = [
		["需求号", e.tracker === "jira" ? "Jira 上的号" : t ? `${t}-1` : ""],
		["跟踪", e.tracker === "jira" ? "Jira" : "不用 Jira"],
		["默认分支", e.default_branch.trim()],
		["GitLab", e.gitlab_project.trim()],
		["团队", e.team.trim()]
	];
	return /* @__PURE__ */ p("ul", {
		className: "imp-kv",
		"aria-label": "kit.json",
		children: n.map(([e, t]) => /* @__PURE__ */ m("li", {
			className: t ? void 0 : "is-empty",
			children: [/* @__PURE__ */ p("small", { children: e }), /* @__PURE__ */ p("b", { children: t || "—" })]
		}, e))
	});
}
function Ja({ c: e, job: t, state: n, readError: r, onStart: i, onCommitted: a }) {
	let s = c(), [l, u] = o(() => e.form ?? La), [d, h] = o(e.branch), g = e.install, [_, v] = o(null), y = g?.options.filter((e) => e.ok) ?? [], b = (y.some((e) => e.mode === _) ? _ : null) ?? y.find((e) => e.mode === g?.recommend)?.mode ?? y[0]?.mode ?? "inplace", x = O((e) => s.post(w.importInstall(), e)), S = (e) => u((t) => ({
		...t,
		...e
	})), C = t?.state === "running", T = t?.state === "done" && !!t.result?.commit.ok, E = g?.current || e.current_branch || "当前分支", D = g?.options.find((e) => e.mode === b), k = async () => {
		if (!e.path) return;
		let t = await x.run({
			path: e.path,
			branch: b === "branch" ? d.trim() : "",
			mode: b,
			kit: {
				...l,
				req_prefix: l.req_prefix.trim().toUpperCase()
			}
		});
		t && i(t.job);
	}, A = !!e.origin?.project && l.gitlab_project === e.origin.project, j = l.tracker === "jira";
	return /* @__PURE__ */ m("section", {
		className: `br-card imp-sec${T ? " is-ok" : ""}`,
		"aria-label": "安装",
		"data-testid": "install",
		children: [
			/* @__PURE__ */ p(Ba, {
				n: 3,
				title: "安装",
				state: n,
				sub: "这个仓库还没装 brain-kit"
			}),
			!t && /* @__PURE__ */ m(f, { children: [g && g.options.length > 1 ? /* @__PURE__ */ p("div", {
				className: "imp-options",
				role: "radiogroup",
				"aria-label": "装在哪",
				"data-testid": "install-modes",
				children: g.options.map((e) => /* @__PURE__ */ p(Ya, {
					o: e,
					on: b === e.mode,
					rec: e.mode === g.recommend,
					onPick: () => v(e.mode)
				}, e.mode))
			}) : /* @__PURE__ */ m("p", {
				className: "imp-where",
				"data-testid": "install-where",
				children: [
					/* @__PURE__ */ p(V, {
						role: "commit",
						size: 18
					}),
					/* @__PURE__ */ p("b", { children: D?.title ?? `直接装在 ${E}` }),
					/* @__PURE__ */ p("span", { children: D?.line ?? "" })
				]
			}), /* @__PURE__ */ m("form", {
				className: "imp-install",
				"aria-label": "kit.json",
				onSubmit: (e) => {
					e.preventDefault(), k();
				},
				children: [/* @__PURE__ */ m("div", {
					className: "imp-grid",
					children: [
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ p("label", {
									htmlFor: "imp-prefix",
									children: "需求号前缀"
								}),
								/* @__PURE__ */ p("input", {
									id: "imp-prefix",
									type: "text",
									className: "br-mono",
									value: l.req_prefix,
									onChange: (e) => S({ req_prefix: e.target.value.toUpperCase() })
								}),
								/* @__PURE__ */ p("p", {
									className: "br-hint",
									children: l.req_prefix ? `需求号会是 ${l.req_prefix}-1、${l.req_prefix}-2 …` : "大写字母开头，最多 10 个，比如 PAY"
								})
							]
						}),
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [/* @__PURE__ */ p("span", {
								className: "br-label",
								id: "imp-tracker-l",
								children: "跟踪方式"
							}), /* @__PURE__ */ m("div", {
								className: "imp-seg",
								role: "radiogroup",
								"aria-labelledby": "imp-tracker-l",
								children: [/* @__PURE__ */ m("label", {
									className: `imp-opt${j ? "" : " is-on"}`,
									children: [/* @__PURE__ */ p("input", {
										type: "radio",
										name: "imp-tracker",
										checked: !j,
										onChange: () => S({ tracker: "none" })
									}), /* @__PURE__ */ p("span", { children: "不用 Jira：按顺序给号" })]
								}), /* @__PURE__ */ m("label", {
									className: `imp-opt${j ? " is-on" : ""}`,
									children: [/* @__PURE__ */ p("input", {
										type: "radio",
										name: "imp-tracker",
										checked: j,
										onChange: () => S({ tracker: "jira" })
									}), /* @__PURE__ */ p("span", { children: "用 Jira 的号" })]
								})]
							})]
						}),
						j && /* @__PURE__ */ m("div", {
							className: "br-field is-full",
							children: [/* @__PURE__ */ p("label", {
								htmlFor: "imp-jira",
								children: "Jira 地址"
							}), /* @__PURE__ */ p("input", {
								id: "imp-jira",
								type: "text",
								className: "br-mono",
								value: l.jira_base,
								placeholder: "https://jira.example.com",
								onChange: (e) => S({ jira_base: e.target.value })
							})]
						}),
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [/* @__PURE__ */ p("label", {
								htmlFor: "imp-gl-base",
								children: "GitLab 地址"
							}), /* @__PURE__ */ p("input", {
								id: "imp-gl-base",
								type: "text",
								className: "br-mono",
								value: l.gitlab_base,
								placeholder: "https://gitlab.example.com",
								onChange: (e) => S({ gitlab_base: e.target.value })
							})]
						}),
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ p("label", {
									htmlFor: "imp-gl-project",
									children: "GitLab 项目"
								}),
								/* @__PURE__ */ p("input", {
									id: "imp-gl-project",
									type: "text",
									className: "br-mono",
									value: l.gitlab_project,
									placeholder: "组/仓库",
									onChange: (e) => S({ gitlab_project: e.target.value })
								}),
								/* @__PURE__ */ p("p", {
									className: "br-hint",
									children: A ? "从 origin 的地址猜的：检查一下。" : "交接和开 MR 用。不用 GitLab 就两个都空着。"
								})
							]
						}),
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [/* @__PURE__ */ p("label", {
								htmlFor: "imp-default",
								children: "默认分支"
							}), /* @__PURE__ */ p("input", {
								id: "imp-default",
								type: "text",
								className: "br-mono",
								value: l.default_branch,
								onChange: (e) => S({ default_branch: e.target.value })
							})]
						}),
						/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [/* @__PURE__ */ p("label", {
								htmlFor: "imp-team",
								children: "团队（可不填）"
							}), /* @__PURE__ */ p("input", {
								id: "imp-team",
								type: "text",
								value: l.team,
								onChange: (e) => S({ team: e.target.value })
							})]
						}),
						b === "branch" && /* @__PURE__ */ m("div", {
							className: "br-field",
							children: [/* @__PURE__ */ p("label", {
								htmlFor: "imp-branch",
								children: "新分支名"
							}), /* @__PURE__ */ p("input", {
								id: "imp-branch",
								type: "text",
								className: "br-mono",
								value: d,
								onChange: (e) => h(e.target.value)
							})]
						})
					]
				}), /* @__PURE__ */ m("aside", {
					className: "imp-preview",
					"aria-label": "会写进 .brain/kit.json",
					children: [
						/* @__PURE__ */ p("b", { children: "会写进 .brain/kit.json" }),
						/* @__PURE__ */ p(qa, { k: l }),
						b === "branch" ? /* @__PURE__ */ m("div", {
							className: "imp-route",
							"aria-label": "新分支从哪来",
							children: [
								/* @__PURE__ */ m("code", { children: [e.origin ? "origin/" : "", l.default_branch.trim() || "main"] }),
								/* @__PURE__ */ p("span", {
									className: "imp-arrow",
									"aria-hidden": "true",
									children: "→"
								}),
								/* @__PURE__ */ p("code", {
									className: "is-new",
									children: d.trim() || "—"
								}),
								/* @__PURE__ */ p("small", { children: "新分支，单独的工作目录" })
							]
						}) : /* @__PURE__ */ m("div", {
							className: "imp-route",
							"aria-label": "提交在哪",
							children: [/* @__PURE__ */ p("code", {
								className: "is-new",
								children: E
							}), /* @__PURE__ */ p("small", { children: "你现在的检出，提交在这里，马上能用" })]
						}),
						/* @__PURE__ */ m("p", {
							className: "imp-safe",
							"data-testid": "install-safe",
							children: [/* @__PURE__ */ p(V, {
								role: "security",
								size: 18
							}), /* @__PURE__ */ p("span", { children: b === "branch" ? "只装在新分支上：从默认分支建，放在单独的工作目录里（work_root 下面）。你现在的检出、分支和改动都不动。提交用你自己的 git 身份，你的 git hook 照常跑。" : "只提交 brain install 写的文件，你自己没提交的改动不碰；用你自己的 git 身份提交，你的 git hook 照常跑；不会自己推送。" })]
						}),
						/* @__PURE__ */ p("div", {
							className: "br-row",
							children: /* @__PURE__ */ m("button", {
								type: "submit",
								className: "br-btn is-primary is-big",
								disabled: x.busy || !D?.ok && !!g || !l.req_prefix.trim() || !l.default_branch.trim() || b === "branch" && !d.trim(),
								children: [/* @__PURE__ */ p(V, {
									role: b === "branch" ? "handover" : "commit",
									size: 17
								}), x.busy ? "正在开始…" : b === "branch" ? "安装到新分支" : `直接装在 ${E}`]
							})
						}),
						x.error && /* @__PURE__ */ p("p", {
							className: "br-error",
							role: "alert",
							children: x.error
						})
					]
				})]
			})] }),
			t && /* @__PURE__ */ p(Ua, {
				job: t,
				what: "安装",
				readError: r
			}),
			t && !C && t.result && /* @__PURE__ */ p(Xa, {
				r: t.result,
				onCommitted: a
			}),
			t && t.state === "failed" && /* @__PURE__ */ p("div", {
				className: "br-row",
				children: /* @__PURE__ */ p("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => i(null),
					children: "改一下再装"
				})
			})
		]
	});
}
function Ya({ o: e, on: t, rec: n, onPick: r }) {
	let i = `imp-mode-${e.mode}`;
	return /* @__PURE__ */ m("label", {
		className: `imp-option${t ? " is-on" : ""}${e.ok ? "" : " is-off"}`,
		"data-mode": e.mode,
		children: [
			/* @__PURE__ */ p("input", {
				type: "radio",
				name: "imp-mode",
				value: e.mode,
				checked: t,
				disabled: !e.ok,
				onChange: r,
				"aria-labelledby": `${i}-t`,
				"aria-describedby": `${i}-d`
			}),
			/* @__PURE__ */ p(V, {
				role: e.mode === "branch" ? "handover" : "commit",
				size: 30
			}),
			/* @__PURE__ */ m("b", {
				id: `${i}-t`,
				children: [e.title, n && /* @__PURE__ */ p("span", {
					className: "br-chip tone-ok imp-rec",
					children: "推荐"
				})]
			}),
			/* @__PURE__ */ p("small", {
				id: `${i}-d`,
				children: e.ok ? e.line : e.why
			}),
			/* @__PURE__ */ p("span", {
				className: "imp-tick",
				"aria-hidden": "true",
				children: t ? "✓" : ""
			})
		]
	});
}
function Xa({ r: e, onCommitted: t }) {
	let n = c(), r = O(() => n.post(w.importCommit(), { path: e.path })), i = r.result ?? e.commit, a = async () => {
		(await r.run())?.ok && t();
	}, o = Ia.map((t) => [t, e.files.filter((e) => (Pa[e.change] ? e.change : "other") === t)]).filter(([, e]) => e.length > 0), s = e.doctor.rows.filter((e) => e.level === "OK"), l = e.mode === "inplace";
	return /* @__PURE__ */ m("div", {
		className: "imp-result",
		"data-testid": "install-result",
		children: [
			/* @__PURE__ */ m("dl", {
				className: "imp-facts",
				children: [
					l ? /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "提交在" }), /* @__PURE__ */ m("dd", { children: [/* @__PURE__ */ p("code", { children: e.branch }), "（你现在的检出）"] })] }) : /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "新分支" }), /* @__PURE__ */ m("dd", { children: [/* @__PURE__ */ p("code", { children: e.branch }), e.base ? `（从 ${e.base} 建）` : ""] })] }),
					e.worktree && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "工作目录" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ p("code", { children: e.worktree }) })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "kit.json" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ p(qa, { k: e.kit }) })] })
				]
			}),
			i.ok ? /* @__PURE__ */ m("div", {
				className: "imp-commit is-ok",
				role: "status",
				"data-testid": "commit-ok",
				children: [/* @__PURE__ */ p("span", {
					className: "imp-mark",
					"aria-hidden": "true",
					children: "✓"
				}), /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", { children: i.text }), l && /* @__PURE__ */ p("small", { children: "这个仓库现在就能用。" })] })]
			}) : i.text ? /* @__PURE__ */ m("div", {
				className: "imp-commit is-bad",
				role: "alert",
				"data-testid": "commit-blocked",
				children: [/* @__PURE__ */ p("span", {
					className: "imp-mark",
					"aria-hidden": "true",
					children: "✕"
				}), /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("p", {
					className: "br-pre",
					children: i.text
				}), /* @__PURE__ */ p("div", {
					className: "br-row",
					children: /* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: r.busy,
						onClick: () => void a(),
						children: [/* @__PURE__ */ p(V, {
							role: "commit",
							size: 16
						}), r.busy ? "正在提交…" : "再提交一次"]
					})
				})] })]
			}) : null,
			i.ok && l && e.remote_url && /* @__PURE__ */ p(je, {
				path: e.path,
				branch: e.branch,
				remoteUrl: e.remote_url
			}),
			r.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: r.error
			}),
			e.doctor.ran && /* @__PURE__ */ m("div", {
				className: "imp-block",
				"data-testid": "doctor",
				children: [/* @__PURE__ */ m("div", {
					className: "imp-block-head",
					children: [
						/* @__PURE__ */ p(V, {
							role: "ci",
							size: 18
						}),
						/* @__PURE__ */ p("b", { children: "brain doctor" }),
						/* @__PURE__ */ p(Ga, { levels: e.doctor.rows.map((e) => e.level) })
					]
				}), e.doctor.rows.length > 0 ? /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ p(Te, {
					rows: e.doctor.rows,
					only: ["FAIL", "WARN"],
					empty: "全部正常。"
				}), s.length > 0 && /* @__PURE__ */ m("details", {
					className: "imp-more",
					children: [/* @__PURE__ */ m("summary", { children: [
						"另外 ",
						s.length,
						" 项正常"
					] }), /* @__PURE__ */ p(Te, { rows: s })]
				})] }) : /* @__PURE__ */ p("pre", {
					className: "br-findings",
					children: e.doctor.output || "（没有输出）"
				})]
			}),
			e.files.length > 0 && /* @__PURE__ */ m("div", {
				className: "imp-block",
				children: [/* @__PURE__ */ m("div", {
					className: "imp-block-head",
					children: [/* @__PURE__ */ p(V, {
						role: "file",
						size: 18
					}), /* @__PURE__ */ p("b", { children: l ? `提交了 ${e.files.length} 个文件` : `改了 ${e.files.length} 个文件` })]
				}), /* @__PURE__ */ p("div", {
					className: "imp-files",
					"data-testid": "changed-files",
					children: o.map(([e, t]) => /* @__PURE__ */ m("div", {
						className: "imp-fgroup",
						"data-change": e,
						children: [/* @__PURE__ */ m("span", {
							className: `br-chip kt-pill tone-${Fa[e]}`,
							children: [
								Pa[e],
								" ",
								/* @__PURE__ */ p("b", { children: t.length })
							]
						}), /* @__PURE__ */ p("ul", { children: t.map((e) => /* @__PURE__ */ p("li", {
							className: "br-tag br-mono",
							children: e.path
						}, e.path)) })]
					}, e))
				})]
			}),
			e.output && /* @__PURE__ */ m("details", {
				className: "imp-more",
				children: [/* @__PURE__ */ p("summary", { children: "brain install 的输出" }), /* @__PURE__ */ p("pre", {
					className: "br-findings",
					children: e.output
				})]
			})
		]
	});
}
var Za = {
	branch: "在分支上",
	uncommitted: "还没提交",
	merged: "要拉取"
};
function Qa({ path: e, p: t, title: n, onChanged: r }) {
	let i = c(), a = O(() => i.post(w.importCommit(), { path: e }));
	return /* @__PURE__ */ m("section", {
		className: "br-card imp-sec is-wait",
		"aria-label": "装在新分支上",
		"data-testid": "pending",
		children: [
			/* @__PURE__ */ p(Ba, {
				n: 3,
				title: n ?? (t.state === "merged" ? `已经合进 ${t.target || "默认分支"}` : "装在新分支上"),
				state: n ? t.pushed ? "done" : void 0 : t.state === "uncommitted" ? "wait" : "done"
			}),
			/* @__PURE__ */ m("div", {
				className: "imp-pend",
				children: [
					/* @__PURE__ */ m("span", {
						className: "br-chip kt-pill tone-wait is-live",
						children: [/* @__PURE__ */ p("i", {
							"aria-hidden": "true",
							children: "✋"
						}), t.word || Za[t.state]]
					}),
					/* @__PURE__ */ p("b", { children: t.text }),
					t.commit && /* @__PURE__ */ p("code", {
						className: "br-tag",
						title: "提交",
						children: t.commit.slice(0, 8)
					})
				]
			}),
			(t.worktree || t.next) && /* @__PURE__ */ m("dl", {
				className: "imp-facts",
				children: [t.worktree && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "工作目录" }), /* @__PURE__ */ p("dd", { children: /* @__PURE__ */ p("code", { children: t.worktree }) })] }), t.next && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "下一步" }), /* @__PURE__ */ p("dd", { children: t.next })] })]
			}),
			t.state === "uncommitted" && /* @__PURE__ */ m("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: a.busy,
						onClick: async () => {
							(await a.run())?.ok && r();
						},
						children: [/* @__PURE__ */ p(V, {
							role: "commit",
							size: 16
						}), a.busy ? "正在提交…" : "再提交一次"]
					}),
					a.result && !a.result.ok && /* @__PURE__ */ p("p", {
						className: "br-bad-text br-pre",
						role: "alert",
						children: a.result.text
					}),
					a.error && /* @__PURE__ */ p("p", {
						className: "br-error",
						role: "alert",
						children: a.error
					})
				]
			}),
			(t.merge || t.pull || t.mr_url) && /* @__PURE__ */ p(J, {
				path: e,
				p: t,
				onDone: r
			}, `${t.state}:${t.branch}`),
			t.state === "branch" && t.remote_url && !t.mr_url && /* @__PURE__ */ p($a, {
				path: e,
				p: t,
				onDone: r
			})
		]
	});
}
function $a({ path: e, p: t, onDone: n }) {
	let r = c(), [i, a] = o(!1), s = O((e) => r.post(w.importPublish(), e)), l = s.result, u = async () => {
		let r = await s.run({
			path: e,
			branch: t.branch,
			target: t.target,
			remote_url: t.remote_url,
			confirm: !0
		});
		r && (a(!1), r.ok && n());
	};
	return /* @__PURE__ */ m("div", {
		className: "imp-block",
		children: [
			!i && (!l || !l.ok) && /* @__PURE__ */ m("div", {
				className: "br-row",
				children: [/* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn",
					onClick: () => a(!0),
					children: [/* @__PURE__ */ p(V, {
						role: "pr",
						size: 16
					}), l ? "再试一次" : t.pushed ? "再推送一次并开 MR" : "推送并开 MR"]
				}), /* @__PURE__ */ p("span", {
					className: "br-hint",
					children: "可选：把这个分支推到远端，在 GitLab 上开 MR。"
				})]
			}),
			i && /* @__PURE__ */ m("div", {
				className: "br-confirm imp-confirm",
				role: "group",
				"aria-label": "确认推送",
				"data-testid": "publish-confirm",
				children: [
					/* @__PURE__ */ m("span", {
						className: "imp-confirm-head",
						children: [/* @__PURE__ */ p(V, {
							role: "pr",
							size: 18
						}), /* @__PURE__ */ p("b", { children: "推送之前确认一下" })]
					}),
					/* @__PURE__ */ m("p", { children: [
						"会把分支 ",
						/* @__PURE__ */ p("code", { children: t.branch }),
						" 推到 origin（",
						/* @__PURE__ */ p("code", { children: t.remote_url }),
						"）",
						t.gitlab_project ? /* @__PURE__ */ m(f, { children: [
							"，再在 GitLab 的 ",
							/* @__PURE__ */ p("code", { children: t.gitlab_project }),
							" 上开 MR：",
							/* @__PURE__ */ p("code", { children: t.branch }),
							" → ",
							/* @__PURE__ */ p("code", { children: t.target }),
							"。"
						] }) : "。kit.json 没写 GitLab 项目：MR 要你自己开。"
					] }),
					t.gitlab_project && !t.can_open_mr && /* @__PURE__ */ p("p", {
						className: "br-hint",
						children: "这台机器上没有 GitLab token：只推送，MR 用给出的命令或链接自己开。"
					}),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [/* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-primary",
							disabled: s.busy,
							onClick: () => void u(),
							children: s.busy ? "正在推送…" : "确定推送"
						}), /* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn",
							disabled: s.busy,
							onClick: () => a(!1),
							children: "取消"
						})]
					})
				]
			}),
			s.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: s.error
			}),
			l && /* @__PURE__ */ p(eo, { r: l })
		]
	});
}
function eo({ r: e }) {
	let [t, n] = o(""), r = e.pushed ? e.commands.slice(1) : e.commands, i = async () => {
		try {
			await navigator.clipboard.writeText(r.join("\n")), n("已复制");
		} catch {
			n("没复制成：请手动选中");
		}
	};
	return /* @__PURE__ */ m("div", {
		className: `imp-commit ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "publish-result",
		children: [/* @__PURE__ */ p("span", {
			className: "imp-mark",
			"aria-hidden": "true",
			children: e.ok ? "✓" : "✕"
		}), /* @__PURE__ */ m("div", { children: [
			/* @__PURE__ */ p("p", {
				className: "br-pre br-strong",
				role: "status",
				children: e.text
			}),
			e.mr && /* @__PURE__ */ p("p", { children: /* @__PURE__ */ m(K, {
				href: e.mr.url,
				children: ["MR !", e.mr.iid]
			}) }),
			!e.mr && /* @__PURE__ */ m(f, { children: [e.new_mr_url && /* @__PURE__ */ p("p", { children: /* @__PURE__ */ p(K, {
				href: e.new_mr_url,
				children: "在 GitLab 上开 MR"
			}) }), r.length > 0 && /* @__PURE__ */ m("div", {
				className: "br-stack",
				style: { gap: 4 },
				children: [
					/* @__PURE__ */ p("span", {
						className: "br-hint",
						children: e.pushed ? "或者在终端里开 MR：" : "在终端里自己做："
					}),
					/* @__PURE__ */ p("pre", {
						className: "br-findings",
						"data-testid": "commands",
						children: r.join("\n")
					}),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [/* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn is-small",
							onClick: () => void i(),
							children: [/* @__PURE__ */ p(H, {
								name: "Copy",
								size: 13
							}), "复制"]
						}), t && /* @__PURE__ */ p("span", {
							className: "br-small br-dim",
							role: "status",
							children: t
						})]
					})
				]
			})] }),
			e.output && /* @__PURE__ */ m("details", {
				className: "imp-more",
				children: [/* @__PURE__ */ p("summary", { children: "git push 的输出" }), /* @__PURE__ */ p("pre", {
					className: "br-findings",
					children: e.output
				})]
			})
		] })]
	});
}
function to({ path: e, pending: t, state: n, onAdded: r, go: i }) {
	let a = c(), o = O(() => a.post(w.importAdd(), { path: e })), s = async () => {
		let e = await o.run();
		e && r(e);
	}, l = o.result;
	return /* @__PURE__ */ m("section", {
		className: `br-card imp-sec${l ? " is-ok" : ""}`,
		"aria-label": "加入列表",
		"data-testid": "add",
		children: [
			/* @__PURE__ */ p(Ba, {
				n: 4,
				title: "加入列表",
				state: n,
				sub: "最后一步"
			}),
			!l && /* @__PURE__ */ m("div", {
				className: "imp-final",
				children: [/* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					disabled: o.busy,
					onClick: () => void s(),
					children: [/* @__PURE__ */ p(V, {
						role: "list",
						size: 18
					}), o.busy ? "正在加入…" : "加入列表"]
				}), /* @__PURE__ */ p("span", {
					className: "br-hint",
					children: t ? `加入以后，列表里这个仓库会显示「${t.text}」：${t.next}。` : "加入以后，交付总览和开需求就能用它。"
				})]
			}),
			l && /* @__PURE__ */ m("div", {
				className: "imp-done",
				role: "status",
				"data-testid": "added",
				children: [
					/* @__PURE__ */ p("span", {
						className: "imp-mark",
						"aria-hidden": "true",
						children: "✓"
					}),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", { children: l.text }), /* @__PURE__ */ p("small", { children: l.status.repos.find((e) => e.id === l.id)?.ok ? "现在就能开需求了。" : l.status.repos.find((e) => e.id === l.id)?.pending?.next ?? "装好以后就能用。" })] }),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [l.status.repos.find((e) => e.id === l.id)?.ok && /* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn is-primary",
							onClick: () => i({
								kind: "new",
								repo: l.id
							}),
							children: [/* @__PURE__ */ p(V, {
								role: "new",
								size: 16
							}), "开需求"]
						}), /* @__PURE__ */ m("button", {
							type: "button",
							className: "br-btn",
							onClick: () => i({ kind: "overview" }),
							children: [/* @__PURE__ */ p(V, {
								role: "list",
								size: 16
							}), "去交付总览"]
						})]
					})
				]
			}),
			o.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: o.error
			})
		]
	});
}
var no = "\n.imp-hero { gap: 16px; padding: 22px 26px; }\n.imp-hero h2 { margin-bottom: 4px; }\n.imp-sec { gap: 14px; }\n.imp-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }\n.imp-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }\n.imp-head small { color: var(--muted); font-size: .88em; }\n.imp-head .imp-end { margin-left: auto; }\n.imp-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;\n  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }\n.imp-n.is-done { background: var(--kt-ok-solid); color: #fff; }\n.imp-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }\n.imp-n.is-bad { background: var(--kt-bad-solid); color: #fff; }\n.imp-n.is-wait { background: var(--kt-approve); color: var(--kt-on); }\n.imp-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }\n.imp-path { padding: 2px 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); font-size: .86em; word-break: break-all; }\n.imp-counts { display: inline-flex; gap: 5px; flex-wrap: wrap; }\n\n/* 从哪来: two big option cards */\n.imp-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n@media (max-width: 800px) { .imp-options { grid-template-columns: minmax(0, 1fr); } }\n.imp-option { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 2px; align-items: center;\n  padding: 14px 44px 14px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); cursor: pointer; transition: border-color .15s, box-shadow .15s; }\n.imp-option:hover { border-color: var(--accent); }\n.imp-option input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }\n.imp-option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.imp-option > .kt-role-icon { grid-row: span 2; justify-self: center; color: var(--text-strong); opacity: .8; }\n.imp-option b { font-size: 1.1em; font-weight: 800; color: var(--text-strong); }\n.imp-option small { color: var(--muted); font-size: .88em; }\n.imp-option.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--card)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 32%, transparent); }\n.imp-option.is-on > .kt-role-icon { color: var(--accent); opacity: 1; }\n.imp-option.is-off { opacity: .62; cursor: not-allowed; }\n.imp-option.is-off small { color: var(--kt-warn); }\n.imp-rec { margin-left: 8px; vertical-align: 2px; font-size: .78em; }\n.imp-where { margin: 0; display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; }\n.imp-where b { color: var(--text-strong); font-weight: 800; }\n.imp-where span { color: var(--muted); font-size: .92em; }\n.imp-where .kt-role-icon { align-self: center; color: var(--kt-ok); }\n.imp-tick { position: absolute; top: 50%; right: 16px; transform: translateY(-50%); width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;\n  border: 2px solid var(--border-strong, var(--border)); font-size: 11px; font-weight: 900; }\n.imp-option.is-on .imp-tick { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }\n.imp-local, .imp-clone { display: grid; gap: 12px; }\n.imp-inline { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }\n.imp-inline input { flex: 1 1 24em; min-width: 0; }\n.imp-stale { margin: 0; display: inline-flex; align-items: center; gap: 8px; color: var(--kt-warn); font-weight: 700; }\n.imp-stale i { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--kt-warn); font-size: .8em; }\n.imp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-content: start; align-items: start; }\n.imp-grid > .br-field { align-content: start; }\n.imp-grid > .is-full { grid-column: 1 / -1; }\n@media (max-width: 800px) { .imp-grid { grid-template-columns: minmax(0, 1fr); } }\n.imp-grid :is(input[type=\"text\"], input:not([type]), select) { width: 100%; }\n\n/* 检查: one row per check, two columns */\n.imp-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 10px; align-items: stretch; }\n@media (max-width: 1000px) { .imp-checks { grid-template-columns: minmax(0, 1fr); } }\n.imp-check { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 10px; align-items: start; padding: 9px 12px; border-radius: 12px;\n  border: 1px solid var(--border); background: var(--kt-glass); }\n.imp-check.is-FAIL { border-color: color-mix(in srgb, var(--kt-bad) 50%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }\n.imp-check.is-WARN { border-color: color-mix(in srgb, var(--kt-warn) 50%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }\n.imp-glyph { grid-row: span 2; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-weight: 900; font-size: 13px;\n  color: var(--kt-tone); border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }\n.imp-check.is-OK .imp-glyph { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); color: #fff; }\n.imp-check-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; padding-top: 2px; }\n.imp-check-main b { color: var(--text-strong); font-weight: 750; white-space: nowrap; }\n.imp-check-main span { color: var(--text); word-break: break-word; }\n.imp-check.is-OK .imp-check-main span { color: var(--muted); }\n.imp-todo { grid-column: 2; font-size: .9em; color: var(--text); }\n.imp-todo b { color: var(--muted); font-weight: 650; margin-right: 6px; }\n.imp-block { display: grid; gap: 8px; }\n.imp-block-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.imp-block-head > .kt-role-icon { color: var(--text-strong); opacity: .85; }\n.imp-block-head b { color: var(--text-strong); font-weight: 750; }\n.imp-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--kt-bad);\n  background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }\n\n/* 装到新分支: the field grid and its live preview */\n.imp-install { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(320px, 1fr); gap: 18px; align-items: start; }\n@media (max-width: 1100px) { .imp-install { grid-template-columns: minmax(0, 1fr); } }\n.imp-seg { display: flex; flex-wrap: wrap; gap: 6px; }\n.imp-opt { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 9px; border-radius: 999px; cursor: pointer; font-size: .92em; font-weight: 650;\n  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }\n.imp-opt input { margin: 0; accent-color: var(--accent); }\n.imp-opt:hover { border-color: var(--accent); }\n.imp-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }\n.imp-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.imp-preview { display: grid; gap: 12px; padding: 14px 16px; border-radius: 14px; border: 1px dashed color-mix(in srgb, var(--kt-info) 55%, var(--border));\n  background: color-mix(in srgb, var(--kt-info) 5%, var(--card)); }\n.imp-preview > b { color: var(--text-strong); font-weight: 750; }\n.imp-kv { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }\n.imp-kv li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px; border-radius: 10px;\n  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }\n.imp-kv small { color: var(--muted); font-size: .82em; font-weight: 650; }\n.imp-kv b { color: var(--text-strong); font-weight: 750; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }\n.imp-kv li.is-empty { border-style: dashed; background: none; }\n.imp-kv li.is-empty b { color: var(--muted); font-weight: 500; }\n.imp-route { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.imp-route code { padding: 3px 9px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); font-weight: 700; color: var(--text-strong); }\n.imp-route code.is-new { border-color: var(--kit-ok); color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 9%, transparent); }\n.imp-route small { color: var(--muted); font-size: .84em; }\n.imp-arrow { color: var(--kt-handoff); font-weight: 900; }\n.imp-safe { margin: 0; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; font-size: .88em; color: var(--text); line-height: 1.55; }\n.imp-safe .kt-role-icon { color: var(--kt-ok); margin-top: 1px; }\n\n/* a job: its state, its time, its steps */\n.imp-job { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-tone) 45%, var(--border)); background: var(--kt-glass); }\n.imp-job.tone-run { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 14%, transparent); }\n.imp-job-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n.imp-elapsed { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; font-size: .9em; }\n\n/* the install's result */\n.imp-result { display: grid; gap: 14px; }\n.imp-facts { display: grid; grid-template-columns: repeat(3, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }\n@media (max-width: 1100px) { .imp-facts { grid-template-columns: minmax(0, 1fr); } }\n.imp-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }\n.imp-facts dd { margin: 3px 0 0; color: var(--text); word-break: break-word; }\n.imp-facts code { color: var(--text-strong); font-weight: 650; }\n.imp-files { display: grid; gap: 8px; }\n.imp-fgroup { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 8px; align-items: start; }\n.imp-fgroup > .kt-pill { justify-self: start; }\n.imp-fgroup ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }\n.imp-fgroup li { font-size: .8em; }\n.imp-commit { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; }\n.imp-commit.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); }\n.imp-commit.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }\n.imp-commit > div { display: grid; gap: 8px; min-width: 0; flex: 1; }\n.imp-commit p { margin: 0; }\n.imp-commit b { color: var(--text-strong); font-weight: 750; }\n.imp-mark { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-weight: 900; color: #fff; background: var(--kt-ok-solid); }\n.imp-commit.is-bad .imp-mark { background: var(--kt-bad-solid); }\n.imp-more > summary { cursor: pointer; color: var(--muted); font-size: .9em; }\n.imp-more[open] > summary { margin-bottom: 8px; }\n\n/* pending, publish, the last step */\n.imp-pend { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }\n.imp-pend b { color: var(--text-strong); font-weight: 750; font-size: 1.05em; }\n.imp-confirm { border-color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }\n.imp-confirm p { margin: 0; }\n.imp-confirm-head { display: inline-flex; align-items: center; gap: 8px; color: var(--kt-approve); }\n.imp-confirm-head b { color: var(--text-strong); }\n.imp-final { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }\n.imp-done { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--kit-ok);\n  background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }\n.imp-done .imp-mark { width: 40px; height: 40px; border-radius: 12px; font-size: 1.3em; box-shadow: 0 0 24px -6px var(--kt-ok); }\n.imp-done > div:not(.br-row) { display: grid; gap: 2px; flex: 1 1 14em; min-width: 0; }\n.imp-done b { font-size: 1.2em; font-weight: 850; color: var(--text-strong); }\n.imp-done small { color: var(--muted); }\n", ro = /^[a-z0-9][a-z0-9-]{0,39}$/, io = "证件号、电话、卡号、邮箱：整份打码。标签后面、姓名列里的人名：在找到的地方打码。看不准是人名（或密码）还是普通词的不打码，列在「请你确认」里。", ao = "密钥打码。私钥和云访问密钥：整份不收。", oo = "认领一个需求，带上它的文档开工。文档先过五关，原件不进任何仓库；开工时 brain start 在它自己的工作目录里开一个 brain-dev 会话，Lean 一步步推进，需求和设计由你批准，做完交给运行机。", so = Object.keys(_), co = {
	ok: {
		tone: "ok",
		glyph: "✓"
	},
	wait: {
		tone: "wait",
		glyph: "✋"
	},
	bad: {
		tone: "bad",
		glyph: "✕"
	},
	warn: {
		tone: "warn",
		glyph: "!"
	},
	auto: {
		tone: "info",
		glyph: "●"
	},
	off: {
		tone: "idle",
		glyph: "–"
	}
};
function lo(e) {
	let t = /^\s*门\s*(\d)/.exec(e);
	return t ? Number(t[1]) : null;
}
function uo({ entry: e, ...t }) {
	let n = c(), r = u(), i = (t.status?.repos ?? []).filter((e) => e.ok), [a, s] = o(e.repo ?? ""), l = a && (!t.status || i.some((e) => e.id === a)) ? a : i[0]?.id ?? "", d = i.find((e) => e.id === l) ?? null, f = d?.me ?? null, h = i.find((e) => e.id === l), g = D(l ? w.intakeNext(l) : null, 0), v = D(w.crew(), 0), [y, b] = o(""), [x, S] = o(""), [C, T] = o(""), [E, k] = o(""), [A, j] = o(!1), [M, N] = o(""), [P, F] = o(""), [I, L] = o(!1), [R, ne] = o(""), [z, B] = o(""), [re, ie] = o(""), [ae, oe] = o(!0), [se, H] = o(!0), ce = g.data && g.data.repo === l ? g.data.key ?? "" : "", le = A ? E : ce, ue = (g.data?.repo === l ? g.data.tracker : "") || h?.kit?.tracker || "none", U = {
		repo: l,
		key: le.trim(),
		slug: C.trim(),
		title: x.trim(),
		docs: ee(P),
		consent: I,
		classification: R,
		business: z,
		exclude: ee(re)
	}, W = JSON.stringify(U), [G, de] = o(null), [fe, pe] = o(""), me = O((e) => n.post(w.intakeCheck(), e)), he = O((e) => n.post(w.intakeStart(), e)), ge = he.result, _e = async () => {
		let e = W;
		de(null), pe("");
		let t = await me.run(U);
		t ? de({
			print: e,
			result: t
		}) : pe(e);
	}, ve = async () => {
		await he.run({
			...U,
			paths: te(M),
			open_session: ae,
			trust: se
		}) && t.reloadStatus();
	}, K = C.trim() !== "" && !ro.test(C.trim()), ye = le.trim() !== "" && !Xe.test(le.trim()), be = ue === "jira" && le.trim() === "", xe = (e) => e.ok && e.blocking.length === 0 && !e.error, q = U.docs.length === 0, Se = G && G.print === W ? G.result : null, Ce = l ? U.title ? ro.test(U.slug) ? be ? "这个仓库用 Jira：要填需求号" : ye ? "需求号的格式不对" : f?.ask ? `先在第 1 步填上${f.label}` : ge?.ok ? "已经开工了" : q ? "" : G ? G.print === W ? xe(G.result) ? "" : "检查没过：先处理红色的几行" : "表单改过了：再检查一遍" : "有文档：先检查一遍（不写入）" : "slug 不对" : "先写标题" : "先选一个仓库", we = Ce === "" && !he.busy, Ee = !!l && !q && !me.busy, De = !q && !Se && !ge?.ok, Oe = /* @__PURE__ */ new Set();
	for (let e of Se ? [...Se.blocking, Se.error] : fe === W ? [me.error] : []) {
		let t = lo(e);
		t && Oe.add(t);
	}
	let ke = !!Se && xe(Se), Ae = (e, t) => q ? "off" : Oe.has(e) ? "bad" : t ? "ok" : "wait", je = (e, t = !1) => q ? "off" : Oe.has(e) ? "bad" : t ? "warn" : ke ? "ok" : "auto", J = [
		Ae(1, I),
		Ae(2, !!R),
		Ae(3, !!z),
		je(4, !!Se?.review.length),
		je(5)
	], Me = (e, t) => e === "ok" ? ke ? "过了" : "好了" : e === "wait" ? t : e === "bad" ? "拦下了" : e === "warn" ? "请你确认" : e === "auto" ? "自动" : "不用", Ne = !!l && !!U.title && ro.test(U.slug) && !be && !ye && !f?.ask, Pe = !!ge?.ok, Fe = !!Se && !xe(Se) || fe === W, Ie = [
		{
			icon: "new",
			title: "认领",
			text: "仓库、标题、slug、需求号",
			state: Pe || Ne ? "done" : "now"
		},
		{
			icon: "security",
			title: "文档过五关",
			text: q ? "没有文档：不用过" : "原件不进任何仓库",
			state: q ? "off" : Pe || ke ? "done" : Fe ? "bad" : Ne ? "now" : void 0
		},
		{
			icon: "laptop",
			title: "开工",
			text: "在它自己的工作目录里开 brain-dev 会话",
			state: Pe ? "done" : ge ? "bad" : we ? "now" : void 0
		},
		{
			icon: "req",
			title: "Lean 推进",
			text: "需求和设计由你批准",
			state: Pe ? "now" : void 0
		},
		{
			icon: "runner",
			title: "交给运行机",
			text: "交接以后它接着做"
		}
	], Re = (e) => Ie[e].state, ze = i.find((e) => e.id === l)?.path, Be = v.data?.rows.filter((e) => (e.level === "FAIL" || e.level === "WARN") && (!e.repo || e.repo === ze)) ?? [], Y = Be.some((e) => e.level === "FAIL"), Ue = (e) => {
		v.data && v.set({
			...v.data,
			rows: e
		}), b(e.some((e) => e.level === "FAIL" || e.level === "WARN") ? "" : "KiroCrew 的检查都过了。"), t.reloadStatus();
	};
	if (t.status && t.status.repos.length === 0) return /* @__PURE__ */ m("main", {
		className: "kt-root br-view nr-root",
		"data-testid": "br-new",
		children: [/* @__PURE__ */ p("style", { children: _o }), /* @__PURE__ */ p(Le, {
			title: "开需求之前，先导入一个仓库",
			onImport: () => t.go({ kind: "import" })
		})]
	});
	let We = (t.status?.repos ?? []).filter((e) => e.pending).length;
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view nr-root",
		"data-testid": "br-new",
		children: [
			/* @__PURE__ */ p("style", { children: _o }),
			/* @__PURE__ */ m("section", {
				className: "br-hero nr-hero",
				"aria-label": "开需求",
				children: [/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("h2", { children: "开需求" }), /* @__PURE__ */ p("p", { children: oo })] }), /* @__PURE__ */ p(He, {
					steps: Ie,
					label: "开需求的步骤"
				})]
			}),
			v.error && /* @__PURE__ */ m("p", {
				className: "br-note",
				children: ["读不到 KiroCrew 的检查：", v.error]
			}),
			Be.length > 0 && v.data && /* @__PURE__ */ m("section", {
				className: `br-card nr-crew ${Y ? "is-bad" : "is-warn"}`,
				"aria-label": "KiroCrew 的检查",
				children: [/* @__PURE__ */ m("header", {
					className: "nr-head",
					children: [Y ? /* @__PURE__ */ p(V, {
						role: "blocked",
						size: 20,
						className: "nr-bad-icon"
					}) : /* @__PURE__ */ p("span", {
						className: "br-prob-glyph tone-warn",
						"aria-hidden": "true",
						children: "!"
					}), /* @__PURE__ */ p("h3", { children: Y ? "开会话之前，KiroCrew 这边要先处理" : `KiroCrew 这边有 ${Be.length} 个提醒，不挡开工` })]
				}), /* @__PURE__ */ p(Te, {
					rows: Be,
					fix: v.data.fix,
					onFixed: Ue
				})]
			}),
			y && /* @__PURE__ */ p("div", {
				className: "br-banner is-ok",
				role: "status",
				children: y
			}),
			t.status && i.length === 0 && /* @__PURE__ */ p("div", {
				className: "br-banner is-error",
				role: "alert",
				"data-testid": "no-usable-repo",
				children: /* @__PURE__ */ m("div", {
					className: "br-row",
					children: [
						/* @__PURE__ */ m("span", { children: [
							"没有能用的仓库",
							We ? `：${We} 个在等 brain-kit 的分支合并` : "",
							"。"
						] }),
						/* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-small",
							onClick: () => t.go({ kind: "import" }),
							children: "导入仓库"
						}),
						/* @__PURE__ */ p("button", {
							type: "button",
							className: "br-btn is-small",
							onClick: () => t.go({ kind: "settings" }),
							children: "去设置"
						})
					]
				})
			}),
			/* @__PURE__ */ m("form", {
				className: "nr-form",
				"aria-label": "开需求",
				onSubmit: (e) => e.preventDefault(),
				children: [
					/* @__PURE__ */ m("section", {
						className: "br-card nr-sec",
						"aria-label": "需求",
						children: [/* @__PURE__ */ p(fo, {
							n: 1,
							title: "认领",
							state: Re(0),
							sub: "这个需求叫什么、放在哪个仓库"
						}), /* @__PURE__ */ m("div", {
							className: "nr-grid",
							children: [
								/* @__PURE__ */ m("div", {
									className: "br-field is-2",
									children: [/* @__PURE__ */ p("label", {
										htmlFor: "new-repo",
										children: "仓库"
									}), /* @__PURE__ */ p("select", {
										id: "new-repo",
										value: l,
										onChange: (e) => {
											s(e.target.value), j(!1), k(""), t.replace({
												kind: "new",
												repo: e.target.value
											});
										},
										children: i.map((e) => /* @__PURE__ */ m("option", {
											value: e.id,
											children: [
												e.name,
												"（",
												e.id,
												"）"
											]
										}, e.id))
									})]
								}),
								/* @__PURE__ */ m("div", {
									className: "br-field is-4",
									children: [/* @__PURE__ */ p("label", {
										htmlFor: "new-title",
										children: "标题"
									}), /* @__PURE__ */ p("input", {
										id: "new-title",
										type: "text",
										value: x,
										placeholder: "商户结算周报",
										onChange: (e) => S(e.target.value)
									})]
								}),
								/* @__PURE__ */ m("div", {
									className: "br-field",
									children: [
										/* @__PURE__ */ p("label", {
											htmlFor: "new-slug",
											children: "slug"
										}),
										/* @__PURE__ */ p("input", {
											id: "new-slug",
											type: "text",
											className: "br-mono",
											value: C,
											placeholder: "merchant-weekly",
											"aria-invalid": K ? !0 : void 0,
											"aria-describedby": "new-slug-hint",
											onChange: (e) => T(e.target.value)
										}),
										/* @__PURE__ */ p("p", {
											className: "br-hint",
											id: "new-slug-hint",
											children: "用在分支名里：英文小写、数字和 -"
										}),
										K && /* @__PURE__ */ p("p", {
											className: "br-error",
											role: "alert",
											children: "slug 只能用英文小写、数字和 -，开头不能是 -，最多 40 个字。"
										})
									]
								}),
								/* @__PURE__ */ m("div", {
									className: "br-field",
									children: [
										/* @__PURE__ */ p("label", {
											htmlFor: "new-key",
											children: "需求号"
										}),
										/* @__PURE__ */ p("input", {
											id: "new-key",
											type: "text",
											className: "br-mono",
											value: le,
											"aria-invalid": ye || be ? !0 : void 0,
											onChange: (e) => {
												k(e.target.value), j(!0);
											}
										}),
										/* @__PURE__ */ m("p", {
											className: "br-hint",
											children: [ue === "jira" ? "这个仓库用 Jira：填 Jira 上的需求号（必填）。" : "不填就用下一个空号。", ce && !A ? `下一个空号是 ${ce}。` : ""]
										}),
										g.error && /* @__PURE__ */ m("p", {
											className: "br-note",
											children: ["读不到下一个空号：", g.error]
										}),
										g.data?.error && /* @__PURE__ */ p("p", {
											className: "br-note",
											children: g.data.error
										}),
										ye && /* @__PURE__ */ p("p", {
											className: "br-error",
											role: "alert",
											children: "需求号的格式像 PAY-12。"
										})
									]
								}),
								/* @__PURE__ */ m("div", {
									className: "br-field is-full",
									children: [
										/* @__PURE__ */ p("label", {
											htmlFor: "new-paths",
											children: "预计会改的路径（用逗号、空格或换行分开）"
										}),
										/* @__PURE__ */ p("textarea", {
											id: "new-paths",
											rows: 2,
											value: M,
											placeholder: "src/refund/",
											onChange: (e) => N(e.target.value)
										}),
										/* @__PURE__ */ p("p", {
											className: "br-hint",
											children: "别的需求也改到这里时会提醒你。"
										})
									]
								}),
								d && f && /* @__PURE__ */ m("div", {
									className: "br-field is-full",
									"data-testid": "new-me",
									children: [!f.ask && /* @__PURE__ */ p("span", {
										className: "br-label",
										children: "认领人"
									}), /* @__PURE__ */ p(Ve, {
										path: d.path,
										me: f,
										onSaved: (e) => t.setStatus(e.status)
									}, d.id)]
								})
							]
						})]
					}),
					/* @__PURE__ */ m("section", {
						className: "br-card nr-sec",
						"aria-label": "文档",
						children: [
							/* @__PURE__ */ p(fo, {
								n: 2,
								title: "文档过五关",
								state: Re(1),
								sub: q ? "没有文档：五关都不用过，也不用检查" : "前三关你来定，后两关自动"
							}),
							/* @__PURE__ */ m("div", {
								className: "nr-grid",
								children: [/* @__PURE__ */ m("div", {
									className: "br-field is-4",
									children: [
										/* @__PURE__ */ p("label", {
											htmlFor: "new-docs",
											children: "文档（一行一个路径）"
										}),
										/* @__PURE__ */ p("textarea", {
											id: "new-docs",
											rows: 2,
											value: P,
											placeholder: "/Users/alice/Downloads/结算周报需求",
											onChange: (e) => F(e.target.value)
										}),
										/* @__PURE__ */ p("p", {
											className: "br-hint",
											children: "这台机器上的文件或文件夹，飞书 / Lark 导出的文件夹也行。"
										})
									]
								}), /* @__PURE__ */ m("div", {
									className: "br-field is-2",
									children: [/* @__PURE__ */ p("label", {
										htmlFor: "new-exclude",
										children: "不收这些文件（glob，一行一个）"
									}), /* @__PURE__ */ p("textarea", {
										id: "new-exclude",
										rows: 2,
										value: re,
										placeholder: "*合作方*",
										onChange: (e) => ie(e.target.value)
									})]
								})]
							}),
							/* @__PURE__ */ m("ol", {
								className: "nr-gates",
								"aria-label": "五关",
								children: [
									/* @__PURE__ */ p(po, {
										n: 1,
										icon: "sign",
										title: "同意",
										state: J[0],
										word: Me(J[0], "等你勾"),
										children: /* @__PURE__ */ m("label", {
											className: `nr-opt${I ? " is-on" : ""}`,
											children: [/* @__PURE__ */ p("input", {
												type: "checkbox",
												checked: I,
												onChange: (e) => L(e.target.checked)
											}), /* @__PURE__ */ p("span", { children: "我是作者，或已取得作者同意" })]
										})
									}),
									/* @__PURE__ */ p(po, {
										n: 2,
										icon: "security",
										title: "密级",
										state: J[1],
										word: Me(J[1], "等你选"),
										children: /* @__PURE__ */ p("div", {
											className: "nr-opts",
											role: "radiogroup",
											"aria-label": "第 2 关：密级",
											children: so.map((e) => /* @__PURE__ */ m("label", {
												className: `nr-opt${R === e ? " is-on" : ""}`,
												children: [/* @__PURE__ */ p("input", {
													type: "radio",
													name: "new-class",
													value: e,
													checked: R === e,
													onChange: () => ne(e)
												}), /* @__PURE__ */ p("span", { children: _[e] })]
											}, e))
										})
									}),
									/* @__PURE__ */ p(po, {
										n: 3,
										icon: "feasibility",
										title: "金额、公司名、合同号",
										state: J[2],
										word: Me(J[2], "等你选"),
										children: /* @__PURE__ */ m("div", {
											className: "nr-opts",
											role: "radiogroup",
											"aria-label": "第 3 关：金额、公司名、合同号",
											children: [/* @__PURE__ */ m("label", {
												className: `nr-opt${z === "keep" ? " is-on" : ""}`,
												children: [/* @__PURE__ */ p("input", {
													type: "radio",
													name: "new-business",
													value: "keep",
													checked: z === "keep",
													onChange: () => B("keep")
												}), /* @__PURE__ */ p("span", { children: "原样保留" })]
											}), /* @__PURE__ */ m("label", {
												className: `nr-opt${z === "mask" ? " is-on" : ""}`,
												children: [/* @__PURE__ */ p("input", {
													type: "radio",
													name: "new-business",
													value: "mask",
													checked: z === "mask",
													onChange: () => B("mask")
												}), /* @__PURE__ */ p("span", { children: "换成占位符" })]
											})]
										})
									}),
									/* @__PURE__ */ p(po, {
										n: 4,
										icon: "person",
										title: "个人信息：自动打码",
										state: J[3],
										word: Me(J[3], ""),
										children: /* @__PURE__ */ p("p", { children: io })
									}),
									/* @__PURE__ */ p(po, {
										n: 5,
										icon: "signer",
										title: "密钥：自动打码",
										state: J[4],
										word: Me(J[4], ""),
										children: /* @__PURE__ */ p("p", { children: ao })
									})
								]
							}),
							/* @__PURE__ */ m("div", {
								className: "nr-go-row",
								children: [
									/* @__PURE__ */ m("button", {
										type: "button",
										className: `br-btn${De ? " is-primary" : ""}`,
										disabled: !Ee,
										onClick: () => void _e(),
										children: [/* @__PURE__ */ p(V, {
											role: "lint",
											size: 16
										}), me.busy ? "正在检查…" : "先检查（不写入）"]
									}),
									G && G.print !== W && /* @__PURE__ */ p("span", {
										className: "br-hint",
										children: "表单改过了，这次检查不算数了。"
									}),
									q && /* @__PURE__ */ p("span", {
										className: "br-hint",
										children: "没有文档：不用检查。"
									})
								]
							}),
							me.error && /* @__PURE__ */ p("p", {
								className: "br-error",
								role: "alert",
								children: me.error
							}),
							G && /* @__PURE__ */ p(mo, {
								c: G.result,
								stale: G.print !== W
							})
						]
					}),
					/* @__PURE__ */ m("section", {
						className: `br-card nr-sec${Pe ? " is-ok" : ""}`,
						"aria-label": "开工",
						children: [
							/* @__PURE__ */ p(fo, {
								n: 3,
								title: "开工",
								state: Re(2),
								sub: "brain start：认领、建分支和工作目录、开会话"
							}),
							/* @__PURE__ */ m("div", {
								className: "nr-toggles",
								children: [/* @__PURE__ */ m("label", {
									className: `nr-toggle${ae ? " is-on" : ""}`,
									children: [
										/* @__PURE__ */ p("input", {
											type: "checkbox",
											checked: ae,
											onChange: (e) => oe(e.target.checked)
										}),
										/* @__PURE__ */ p(V, {
											role: "laptop",
											size: 18
										}),
										/* @__PURE__ */ p("span", { children: "开工后在这个需求的目录里开一个 brain-dev 会话" })
									]
								}), /* @__PURE__ */ m("label", {
									className: `nr-toggle${ae && se ? " is-on" : ""}${ae ? "" : " is-disabled"}`,
									children: [
										/* @__PURE__ */ p("input", {
											type: "checkbox",
											checked: se,
											disabled: !ae,
											onChange: (e) => H(e.target.checked)
										}),
										/* @__PURE__ */ p(V, {
											role: "approved",
											size: 18
										}),
										/* @__PURE__ */ p("span", { children: "这个会话的工具调用不用逐个批准" })
									]
								})]
							}),
							/* @__PURE__ */ m("div", {
								className: "nr-go-row",
								children: [/* @__PURE__ */ m("button", {
									type: "button",
									className: "br-btn is-primary nr-go-btn",
									disabled: !we,
									onClick: () => void ve(),
									children: [/* @__PURE__ */ p(V, {
										role: "deploy",
										size: 20
									}), he.busy ? "正在开工…" : "开工"]
								}), Ce ? /* @__PURE__ */ m("span", {
									className: `nr-why${Pe ? " is-ok" : ""}`,
									"data-testid": "start-why",
									children: [/* @__PURE__ */ p("i", {
										"aria-hidden": "true",
										children: Pe ? "✓" : "✋"
									}), Ce]
								}) : !he.busy && /* @__PURE__ */ m("span", {
									className: "nr-why is-ok",
									"data-testid": "start-ready",
									children: [/* @__PURE__ */ p("i", {
										"aria-hidden": "true",
										children: "✓"
									}), "可以开工了"]
								})]
							}),
							he.error && /* @__PURE__ */ p("p", {
								className: "br-error",
								role: "alert",
								children: he.error
							}),
							ge && /* @__PURE__ */ p(go, {
								r: ge,
								onOpen: r,
								path: d?.path ?? "",
								onMe: (e) => t.setStatus(e.status),
								onBoard: (e) => t.go({
									kind: "board",
									repo: l,
									key: e
								}),
								onItem: (e) => t.go({
									kind: "item",
									repo: l,
									key: e
								})
							})
						]
					})
				]
			})
		]
	});
}
function fo({ n: e, title: t, state: n, sub: r }) {
	return /* @__PURE__ */ m("header", {
		className: "nr-head",
		"data-step": e,
		"data-state": n,
		children: [
			/* @__PURE__ */ p("span", {
				className: `nr-n${n ? ` is-${n}` : ""}`,
				"aria-hidden": "true",
				children: n === "done" ? "✓" : e
			}),
			/* @__PURE__ */ p("h3", { children: t }),
			r && /* @__PURE__ */ p("small", { children: r })
		]
	});
}
function po({ n: e, icon: t, title: n, state: r, word: i, children: a }) {
	let o = co[r];
	return /* @__PURE__ */ m("li", {
		className: `nr-gate is-${r}`,
		"data-testid": `gate-${e}`,
		"data-state": r,
		children: [
			/* @__PURE__ */ m("div", {
				className: "nr-gate-top",
				children: [
					/* @__PURE__ */ p(V, {
						role: t,
						size: 20
					}),
					/* @__PURE__ */ m("span", {
						className: "nr-gate-n",
						children: [
							"第 ",
							e,
							" 关"
						]
					}),
					/* @__PURE__ */ m("span", {
						className: `br-chip kt-pill tone-${o.tone}`,
						children: [/* @__PURE__ */ p("i", {
							"aria-hidden": "true",
							children: o.glyph
						}), i]
					})
				]
			}),
			/* @__PURE__ */ p("b", {
				className: "nr-gate-title",
				children: n
			}),
			a
		]
	});
}
function mo({ c: e, stale: t }) {
	let n = e.blocking.filter((t) => !e.findings.includes(t)), r = e.ok && e.blocking.length === 0 && !e.error, i = (e.findings.length > 0 || n.length > 0) && /* @__PURE__ */ m("div", {
		className: "nr-finds-box",
		children: [/* @__PURE__ */ p("b", {
			className: "br-strong",
			children: "brain-kit 的检查结果"
		}), /* @__PURE__ */ m("ul", {
			className: "nr-finds",
			"data-testid": "findings",
			children: [n.map((e, t) => /* @__PURE__ */ p("li", {
				className: "is-blocking",
				children: e
			}, `b${t}`)), [...e.findings].sort((t, n) => Number(e.blocking.includes(n)) - Number(e.blocking.includes(t))).map((t, n) => /* @__PURE__ */ p("li", {
				className: e.blocking.includes(t) ? "is-blocking" : void 0,
				children: t
			}, `f${n}`))]
		})]
	}), a = e.blocking.length > 0;
	return /* @__PURE__ */ m("div", {
		className: `nr-result${t ? " is-stale" : ""}`,
		"data-testid": "check-result",
		children: [
			e.error ? /* @__PURE__ */ p("p", {
				className: "br-error br-pre",
				role: "alert",
				children: e.error
			}) : /* @__PURE__ */ m("div", {
				className: `nr-verdict ${r ? "is-ok" : "is-bad"}`,
				role: "status",
				children: [/* @__PURE__ */ p(V, {
					role: r ? "approved" : "blocked",
					size: 22
				}), /* @__PURE__ */ p("b", { children: r ? "检查过了：可以开工。" : "有关卡没过：先处理红色的几行。" })]
			}),
			!e.error && /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("div", {
				className: "nr-cells",
				children: [
					/* @__PURE__ */ p(ho, {
						n: e.blocking.length,
						label: "拦下",
						tone: e.blocking.length ? "bad" : "ok"
					}),
					/* @__PURE__ */ p(ho, {
						n: e.review.length,
						label: "请你确认",
						tone: e.review.length ? "warn" : "ok"
					}),
					/* @__PURE__ */ p(ho, {
						n: e.findings.length,
						label: "条发现"
					}),
					/* @__PURE__ */ p(ho, {
						n: e.refused.length,
						label: "份没收",
						tone: e.refused.length ? "warn" : void 0
					})
				]
			}), /* @__PURE__ */ m("ul", {
				className: "nr-pkg",
				"data-testid": "check-summary",
				"aria-label": "文档包",
				children: [
					/* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("small", { children: "文档包" }), /* @__PURE__ */ p("b", {
						className: "br-mono",
						children: e.package ?? "—"
					})] }),
					/* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("small", { children: "密级" }), /* @__PURE__ */ p("b", { children: e.classification ?? "—" })] }),
					/* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("b", { children: e.sources }), /* @__PURE__ */ p("small", { children: "份来源" })] }),
					/* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("b", { children: e.segments }), /* @__PURE__ */ p("small", { children: "段" })] }),
					e.key && /* @__PURE__ */ m("li", { children: [/* @__PURE__ */ p("small", { children: "需求号" }), /* @__PURE__ */ p("b", {
						className: "br-mono",
						children: e.key
					})] })
				]
			})] }),
			a && i,
			e.review.length > 0 && /* @__PURE__ */ m("div", {
				className: "nr-review",
				"data-testid": "review",
				children: [
					/* @__PURE__ */ m("span", {
						className: "nr-review-head",
						children: [/* @__PURE__ */ p("i", {
							"aria-hidden": "true",
							children: "!"
						}), /* @__PURE__ */ p("b", {
							className: "br-strong",
							children: "请你确认"
						})]
					}),
					/* @__PURE__ */ p("ul", { children: e.review.map((e, t) => /* @__PURE__ */ p("li", { children: e }, t)) }),
					/* @__PURE__ */ p("p", { children: "这些没打码，也不拦开工：可能是人名或密码，也可能只是普通的词。是人名或密码的话，先改原文，再检查一遍。" })
				]
			}),
			e.refused.length > 0 && /* @__PURE__ */ m("div", {
				className: "nr-refused",
				children: [/* @__PURE__ */ p("b", {
					className: "br-strong",
					children: "没收的文件"
				}), /* @__PURE__ */ p("ul", { children: e.refused.map((e) => /* @__PURE__ */ m("li", { children: [
					/* @__PURE__ */ p("span", {
						className: "br-mono",
						children: e.id
					}),
					e.name,
					"：",
					e.reason
				] }, e.id)) })]
			}),
			!a && i
		]
	});
}
function ho({ n: e, label: t, tone: n }) {
	return /* @__PURE__ */ m("div", {
		className: `nr-cell${n ? ` is-${n}` : ""}`,
		children: [/* @__PURE__ */ p("b", { children: e }), /* @__PURE__ */ p("small", { children: t })]
	});
}
function go({ r: e, path: t, onOpen: n, onBoard: r, onItem: i, onMe: a }) {
	return /* @__PURE__ */ m("div", {
		className: `nr-started ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "start-result",
		children: [
			/* @__PURE__ */ m("div", {
				className: "nr-started-head",
				children: [/* @__PURE__ */ p("span", {
					className: "nr-started-mark",
					"aria-hidden": "true",
					children: e.ok ? "✓" : "✕"
				}), /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", {
					role: "status",
					children: e.ok ? `开工了${e.key ? `：${e.key}` : ""}` : "没开成"
				}), /* @__PURE__ */ p("small", { children: e.ok ? e.url ? "会话开好了：在会话里一步步推进 Lean。" : "分支和工作目录都好了。" : "看下面 brain start 的输出。" })] })]
			}),
			/* @__PURE__ */ m("dl", {
				className: "nr-facts",
				children: [
					!e.ok && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "需求号" }), /* @__PURE__ */ p("dd", { children: e.key ?? "—" })] }),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "分支" }), /* @__PURE__ */ p("dd", { children: e.branch ?? "—" })] }),
					/* @__PURE__ */ m("div", {
						className: "is-wide",
						children: [/* @__PURE__ */ p("dt", { children: "工作目录" }), /* @__PURE__ */ p("dd", { children: e.worktree ?? "—" })]
					}),
					e.intent && /* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("dt", { children: "Lean intent" }), /* @__PURE__ */ p("dd", { children: e.intent })] })
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-row",
				children: [e.url && /* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => n(e.url),
					children: [/* @__PURE__ */ p(V, {
						role: "laptop",
						size: 18
					}), "打开会话"]
				}), e.key && /* @__PURE__ */ m(f, { children: [/* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn",
					onClick: () => r(e.key),
					children: [/* @__PURE__ */ p(V, {
						role: "runner",
						size: 16
					}), "看需求看板"]
				}), /* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn",
					onClick: () => i(e.key),
					children: [/* @__PURE__ */ p(V, {
						role: "file",
						size: 16
					}), "看需求详情"]
				})] })]
			}),
			!e.ok && e.problem && /* @__PURE__ */ m("div", {
				className: "br-banner is-error nr-who",
				role: "alert",
				"data-testid": "start-who",
				children: [
					/* @__PURE__ */ p("b", { children: e.problem.text }),
					e.problem.todo && /* @__PURE__ */ p("span", { children: e.problem.todo }),
					e.me && t && /* @__PURE__ */ p(Ve, {
						path: t,
						me: e.me,
						onSaved: a
					})
				]
			}),
			!e.url && e.session_error && /* @__PURE__ */ m("p", {
				className: "br-error br-pre",
				role: "alert",
				children: ["会话没开成：", e.session_error]
			}),
			e.output && /* @__PURE__ */ m("details", {
				className: "br-raw nr-out",
				open: !e.ok,
				children: [/* @__PURE__ */ p("summary", { children: "brain start 的输出" }), /* @__PURE__ */ p("pre", { children: e.output })]
			})
		]
	});
}
var _o = "\n.nr-root { --nr-gap: 16px; }\n.nr-hero { gap: 16px; padding: 22px 26px; }\n.nr-hero h2 { margin-bottom: 4px; }\n.nr-form { display: grid; gap: var(--nr-gap); }\n.nr-sec { gap: 14px; }\n.nr-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }\n.nr-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }\n.nr-head small { color: var(--muted); font-size: .88em; }\n.nr-bad-icon { color: var(--kt-bad); }\n.nr-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;\n  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }\n.nr-n.is-done { background: var(--kt-ok-solid); color: #fff; }\n.nr-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }\n.nr-n.is-bad { background: var(--kt-bad-solid); color: #fff; }\n.nr-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }\n.nr-sec.is-ok { border-color: var(--kit-ok); }\n\n/* the fields: a grid of six columns */\n.nr-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px 16px; align-items: start; }\n.nr-grid > * { grid-column: span 3; min-width: 0; }\n.nr-grid > .is-2 { grid-column: span 2; }\n.nr-grid > .is-4 { grid-column: span 4; }\n.nr-grid > .is-full { grid-column: 1 / -1; }\n@media (max-width: 900px) { .nr-grid > * { grid-column: 1 / -1 !important; } }\n.nr-grid :is(input[type=\"text\"], input:not([type]), select, textarea) { width: 100%; }\n.nr-grid > .br-field { align-content: start; }\n.nr-grid textarea { min-height: 2.9em; }\n.nr-who { display: grid; gap: 6px; }\n\n/* the five gates: a row of cards, arrows between them (the board's team introduction) */\n.nr-gates { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1.1fr) minmax(0, 1.35fr) minmax(0, 1fr); align-items: stretch; }\n@media (max-width: 1250px) { .nr-gates { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .nr-gate::after { display: none; } }\n.nr-gate { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 14px 14px; border-radius: 14px;\n  border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); transition: border-color .2s, background .2s; }\n.nr-gate:not(:last-child)::after { content: '→'; position: absolute; right: -16px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.1em; }\n.nr-gate.is-ok { border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 7%, var(--card)); }\n.nr-gate.is-wait { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }\n.nr-gate.is-bad { border-color: var(--kt-bad); box-shadow: 0 0 0 1px var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }\n.nr-gate.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 7%, var(--card)); }\n.nr-gate.is-auto { border-color: color-mix(in srgb, var(--kt-info) 38%, var(--border)); }\n.nr-gate.is-off { border-style: dashed; border-color: var(--border-strong, var(--border)); background: transparent; }\n.nr-gate.is-off > :not(.nr-gate-top) { opacity: .62; }\n.nr-gate-top { display: flex; align-items: center; gap: 8px; }\n.nr-gate-top .kt-role-icon { color: var(--text-strong); opacity: .9; }\n.nr-gate.is-ok .nr-gate-top .kt-role-icon { color: var(--kt-ok); opacity: 1; }\n.nr-gate.is-wait .nr-gate-top .kt-role-icon { color: var(--kt-approve); opacity: 1; }\n.nr-gate.is-bad .nr-gate-top .kt-role-icon { color: var(--kt-bad); opacity: 1; }\n.nr-gate.is-off .nr-gate-top .kt-role-icon { opacity: .5; }\n.nr-gate-n { font-size: .84em; font-weight: 800; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }\n.nr-gate-top .kt-pill { margin-left: auto; }\n.nr-gate.is-wait .kt-pill i { animation: kt-blink 1.6s ease-in-out infinite; }\n.nr-gate-title { font-size: 1.06em; font-weight: 800; color: var(--text-strong); }\n.nr-gate p { margin: 0; font-size: .86em; color: var(--text); line-height: 1.55; }\n.nr-opts { display: flex; flex-wrap: wrap; gap: 6px; }\n.nr-opt { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px 4px 8px; border-radius: 999px; cursor: pointer; font-size: .9em; font-weight: 650;\n  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }\n.nr-opt input { margin: 0; accent-color: var(--accent); }\n.nr-opt:hover { border-color: var(--accent); }\n.nr-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }\n.nr-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.nr-gate > .nr-opt { align-self: flex-start; border-radius: 12px; white-space: normal; }\n\n/* the check's answer */\n.nr-result { display: grid; gap: 12px; }\n.nr-result.is-stale { opacity: .55; }\n.nr-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; font-size: 1.04em; }\n.nr-verdict.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); color: var(--kt-ok); }\n.nr-verdict.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }\n.nr-verdict b { font-weight: 800; }\n.nr-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }\n@media (max-width: 900px) { .nr-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.nr-cell { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }\n.nr-cell b { font-size: 1.9em; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--text-strong); }\n.nr-cell small { color: var(--muted); font-weight: 700; font-size: .9em; }\n.nr-cell.is-ok { border-color: var(--kit-ok); } .nr-cell.is-ok b { color: var(--kt-ok); }\n.nr-cell.is-bad { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent); } .nr-cell.is-bad b { color: var(--kt-bad); }\n.nr-cell.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 8%, transparent); } .nr-cell.is-warn b { color: var(--kt-warn); }\n.nr-pkg { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }\n.nr-pkg li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 11px; border-radius: 10px;\n  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }\n.nr-pkg small { color: var(--muted); font-size: .84em; font-weight: 650; }\n.nr-pkg b { color: var(--text-strong); font-weight: 750; }\n.nr-review { display: grid; gap: 6px; padding: 10px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-warn) 60%, var(--border));\n  background: color-mix(in srgb, var(--kt-warn) 8%, var(--card)); }\n.nr-review-head { display: inline-flex; align-items: center; gap: 8px; }\n.nr-review-head i { font-style: normal; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font-weight: 900; font-size: .85em;\n  color: var(--kt-warn); border: 2px solid var(--kt-warn); background: color-mix(in srgb, var(--kt-warn) 14%, transparent); }\n.nr-review ul { margin: 0; padding-left: 1.3em; color: var(--text-strong); }\n.nr-review p { margin: 0; font-size: .86em; color: var(--muted); }\n.nr-refused { display: grid; gap: 6px; }\n.nr-refused ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }\n.nr-refused li { display: inline-flex; align-items: baseline; gap: 6px; padding: 3px 10px; border-radius: 10px; font-size: .9em; border: 1px dashed color-mix(in srgb, var(--kt-warn) 60%, var(--border)); }\n.nr-refused li .br-mono { color: var(--muted); font-weight: 700; }\n.nr-finds-box { display: grid; gap: 6px; }\n.nr-finds { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n.nr-finds li { padding: 6px 10px; border-radius: 8px; font-family: var(--mono, ui-monospace, monospace); font-size: .85em; white-space: pre-wrap; word-break: break-word;\n  background: var(--kt-glass); border-left: 3px solid color-mix(in srgb, var(--kt-info) 55%, transparent); }\n.nr-finds li.is-blocking { color: var(--kt-bad); font-weight: 700; border-left-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent); }\n\n/* 开工 */\n.nr-toggles { display: flex; flex-wrap: wrap; gap: 8px; }\n.nr-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; cursor: pointer; font-weight: 650;\n  border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); }\n.nr-toggle input { margin: 0; accent-color: var(--accent); }\n.nr-toggle.is-on { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--text-strong); }\n.nr-toggle.is-disabled { opacity: .55; cursor: not-allowed; }\n.nr-toggle:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.nr-go-row { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }\n.nr-go-btn { font-size: 1.14em; padding: 12px 34px; border-radius: 14px; font-weight: 800; }\n.nr-go-btn:not(:disabled) { box-shadow: 0 10px 30px -12px var(--accent); }\n.nr-why { display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 999px; font-weight: 700;\n  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 11%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 42%, transparent); }\n.nr-why i { font-style: normal; }\n.nr-why.is-ok { color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 11%, transparent); border-color: color-mix(in srgb, var(--kt-ok) 42%, transparent); }\n.nr-started { display: grid; gap: 14px; padding: 16px 20px; border-radius: 16px; border: 1px solid var(--kit-ok);\n  background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }\n.nr-started.is-bad { border-color: var(--kit-bad); background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-bad) 12%, transparent), transparent 60%), var(--card); }\n.nr-started-head { display: flex; align-items: center; gap: 14px; }\n.nr-started-head > div { display: grid; gap: 2px; }\n.nr-started-head b { font-size: 1.35em; font-weight: 850; color: var(--text-strong); }\n.nr-started-head small { color: var(--muted); font-size: .92em; }\n.nr-started-mark { flex: none; width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; font-weight: 900; font-size: 1.35em;\n  background: var(--kt-ok-solid); color: #fff; box-shadow: 0 0 24px -6px var(--kt-ok); }\n.nr-started.is-bad .nr-started-mark { background: var(--kt-bad-solid); box-shadow: none; }\n.nr-facts { display: grid; grid-template-columns: repeat(4, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }\n.nr-facts > .is-wide { grid-column: span 1; }\n@media (max-width: 1100px) { .nr-facts { grid-template-columns: minmax(0, 1fr); } }\n.nr-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }\n.nr-facts dd { margin: 2px 0 0; font-family: var(--mono, ui-monospace, monospace); font-size: .95em; color: var(--text-strong); word-break: break-all; }\n.nr-out pre { max-height: 16em; overflow: auto; }\n", vo = [
	[
		"需求",
		"需求",
		"逆向 · 需求 · 用户故事"
	],
	[
		"设计",
		"设计",
		"应用设计 · 拆单元 · 细化"
	],
	[
		"构建",
		"构建",
		"代码生成 · 构建测试"
	],
	[
		"交给运行机",
		"交给运行机",
		"交接 · 桥 · 签名 · brain-run"
	],
	[
		"发布验收",
		"发布 · 验收",
		"RELEASE · 产品验收"
	],
	[
		"已合并",
		"已合并",
		"近 14 天"
	]
], yo = [
	[
		"approve",
		"等人批准",
		"req"
	],
	[
		"answer",
		"等人回答问题",
		"question"
	],
	[
		"local",
		"AI 在做（本机）",
		"laptop"
	],
	[
		"runner",
		"运行机在做",
		"runner"
	]
];
function bo(e) {
	if (e.state === "closed") return null;
	if (e.state === "merged") return "已合并";
	if (e.state === "acceptance") return "发布验收";
	let t = e.lean.stage_n ?? 0, n = e.state === "handed_over" || e.state === "running" || e.state === "rejected" || e.state === "parked" && (e.mr !== null || e.run_ids.length > 0);
	return t >= 11 ? "发布验收" : n ? "交给运行机" : e.state === "claimed" || t <= 3 ? "需求" : t <= 8 ? "设计" : "构建";
}
function xo(e) {
	return e.waits.line || e.state === "claimed" || e.state === "rejected" || e.state === "acceptance" || e.state === "handed_over" && e.waits.who === "you" ? "approve" : e.state === "parked" ? "answer" : e.state === "running" || e.state === "handed_over" ? "runner" : "local";
}
function So({ r: e, at: t, hl: n, onOpen: r, repoName: i }) {
	let a = xo(e), o = a === "local" ? e.waits.who === "agent" : a === "runner", s = a === "approve" || a === "answer";
	return /* @__PURE__ */ m("div", {
		className: `cto-kcard cto-pick${s ? " is-live is-wait" : o ? " is-live is-agent" : ""}${n === e.key ? " is-hl" : ""}`,
		"data-key": e.key,
		"data-testid": "flow-card",
		role: "button",
		tabIndex: 0,
		title: "打开它的需求看板",
		onClick: () => r(e),
		onKeyDown: (t) => (t.key === "Enter" || t.key === " ") && (t.preventDefault(), r(e)),
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-ktop",
				children: [/* @__PURE__ */ m("span", {
					className: s ? "cto-gate" : "",
					children: [s && /* @__PURE__ */ p(V, {
						role: a === "answer" ? "question" : e.state === "acceptance" ? "release" : "req",
						size: 13
					}), /* @__PURE__ */ p("b", {
						className: "kt-mono",
						children: e.key
					})]
				}), /* @__PURE__ */ p("span", { children: j(e.updated_at, t) })]
			}),
			/* @__PURE__ */ p("div", {
				className: "cto-ktitle",
				title: e.title,
				children: e.title
			}),
			/* @__PURE__ */ p("div", {
				className: "cto-kfocus br-kwait",
				title: e.waits.text,
				children: e.waits.text || e.state_label
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-kmeta",
				children: [
					i ? `${i} · ` : "",
					e.owner ?? "—",
					e.stage ? ` · ${e.stage}` : "",
					e.credits === null ? "" : ` · ${M(e.credits)} credits`
				]
			})
		]
	});
}
function Co({ rows: e, at: t, hl: n, onOpen: r, onNew: i, repoName: a }) {
	let o = e.filter((e) => bo(e) && bo(e) !== "已合并"), s = e.filter((e) => bo(e) === "已合并" && (e.updated_at ?? 0) >= t - 1209600), c = (e, t) => o.filter((n) => bo(n) === e && xo(n) === t).sort((e, t) => (t.updated_at ?? 0) - (e.updated_at ?? 0)), l = (e) => e === "已合并" ? s.length : o.filter((t) => bo(t) === e).length, u = o.filter((e) => xo(e) === "approve").length, d = o.filter((e) => xo(e) === "answer").length, f = o.filter((e) => xo(e) === "local").length, h = o.filter((e) => xo(e) === "runner").length, g = new Set(e.map((e) => e.repo)).size > 1;
	return /* @__PURE__ */ m("section", {
		className: "cto-card cto-flow",
		"aria-label": "需求流动",
		"data-anchor": "flow",
		"data-testid": "flow",
		children: [
			/* @__PURE__ */ m("div", {
				className: "cto-flow-head",
				children: [
					/* @__PURE__ */ p("span", {
						className: "cto-live",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ p("h3", { children: "需求流动" }),
					/* @__PURE__ */ p("span", {
						className: "cto-dim",
						children: "此刻 · 每 5 秒刷新 · 点卡片打开它的需求看板"
					}),
					/* @__PURE__ */ p("span", { className: "cto-grow" }),
					i && /* @__PURE__ */ p("button", {
						type: "button",
						className: "kt-btn is-small cto-noprint",
						onClick: i,
						children: "开需求 ↗"
					})
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-stats",
				"data-testid": "flow-stats",
				children: [
					"进行中 ",
					o.length,
					" 个",
					/* @__PURE__ */ p("span", { children: "·" }),
					"等人批准 ",
					u,
					/* @__PURE__ */ p("span", { children: "·" }),
					"等人回答 ",
					d,
					/* @__PURE__ */ p("span", { children: "·" }),
					"AI 在本机做 ",
					f,
					/* @__PURE__ */ p("span", { children: "·" }),
					"运行机在做 ",
					h
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-kanban br-kanban",
				role: "table",
				"aria-label": "需求流动看板",
				children: [
					/* @__PURE__ */ p("div", {}),
					vo.map(([e, t, n]) => /* @__PURE__ */ m("div", {
						className: "cto-kb-h",
						children: [/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("b", { children: t }), /* @__PURE__ */ p("span", {
							className: "cto-n",
							children: l(e)
						})] }), /* @__PURE__ */ p("div", {
							className: "cto-st",
							children: n
						})]
					}, e)),
					yo.map(([e, i, o]) => /* @__PURE__ */ p(wo, {
						lane: e,
						name: i,
						icon: o,
						cell: c,
						at: t,
						hl: n,
						onOpen: r,
						repoName: g ? a : () => void 0,
						merged: e === "approve" ? s : null
					}, e))
				]
			})
		]
	});
}
function wo({ lane: e, name: t, icon: n, cell: r, at: i, hl: a, onOpen: o, repoName: s, merged: c }) {
	let l = e === "approve" || e === "answer";
	return /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("div", {
			className: `cto-lane${l ? " is-wait" : ""}`,
			children: /* @__PURE__ */ m("span", {
				className: "br-lane-name",
				children: [/* @__PURE__ */ p(V, {
					role: n,
					size: 15
				}), t]
			})
		}),
		vo.filter(([e]) => e !== "已合并").map(([t]) => {
			let n = r(t, e);
			return /* @__PURE__ */ m("div", {
				className: `cto-cell${l ? " is-wait" : ""}`,
				"data-col": t,
				"data-lane": e,
				children: [
					n.length === 0 && t === "交给运行机" && e === "local" && /* @__PURE__ */ p("div", {
						className: "cto-kempty",
						children: "交给运行机以后就不在本机做了"
					}),
					n.slice(0, 2).map((e) => /* @__PURE__ */ p(So, {
						r: e,
						at: i,
						hl: a,
						onOpen: o,
						repoName: s(e.repo)
					}, `${e.repo}/${e.key}`)),
					n.length > 2 && /* @__PURE__ */ m("div", {
						className: "cto-kmore",
						children: [
							"+",
							n.length - 2,
							" 个"
						]
					})
				]
			}, t);
		}),
		c && /* @__PURE__ */ m("div", {
			className: "cto-cell is-span br-merged-cell",
			"data-col": "已合并",
			children: [
				c.length === 0 && /* @__PURE__ */ p("div", {
					className: "cto-kempty",
					children: "近 14 天还没有合并的"
				}),
				c.slice(0, 5).map((e) => /* @__PURE__ */ m("button", {
					type: "button",
					"data-key": e.key,
					className: `cto-kcard is-real${a === e.key ? " is-hl" : ""}`,
					title: "打开它的需求看板（可以回放）",
					onClick: () => o(e),
					children: [
						/* @__PURE__ */ m("span", {
							className: "cto-ktop",
							children: [/* @__PURE__ */ p("b", {
								className: "kt-mono",
								children: e.key
							}), /* @__PURE__ */ p("span", { children: j(e.updated_at, i) })]
						}),
						/* @__PURE__ */ p("span", {
							className: "cto-ktitle",
							children: e.title
						}),
						/* @__PURE__ */ m("span", {
							className: "cto-kmeta",
							children: [e.owner ?? "—", e.credits === null ? "" : ` · ${M(e.credits)} credits`]
						})
					]
				}, `${e.repo}/${e.key}`)),
				c.length > 5 && /* @__PURE__ */ m("div", {
					className: "cto-kmore",
					children: [
						"+",
						c.length - 5,
						" 个（见下方交付清单）"
					]
				})
			]
		})
	] });
}
//#endregion
//#region src/views/Overview.tsx
var To = Object.keys(g), Eo = "\n.br-ov .cto-hero h2 { font-size: 30px; }\n.br-ov .cto-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n@media (max-width: 1180px) { .br-ov .cto-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-ov .cto-value .cto-of { font-size: .5em; margin-left: 6px; }\n.br-ov .cto-foot .br-link { font-size: 13px; }\n.br-ov .br-kanban { grid-template-columns: 116px repeat(6, minmax(0, 1fr)); }\n.br-ov .br-merged-cell { grid-row: span 4; }\n.br-ov .cto-lane { justify-content: flex-start; padding: 8px 10px; white-space: normal; text-align: left; }\n.br-ov .br-lane-name { display: inline-flex; align-items: center; gap: 6px; }\n.br-ov .cto-lane.is-wait .kt-role-icon { color: var(--kt-approve); }\n.br-ov .br-kwait { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }\n.br-ov .cto-kcard.is-live.is-wait .br-kwait { color: var(--kt-approve); font-weight: 650; }\n.br-ov .cto-kcard .cto-gate { display: inline-flex; align-items: center; gap: 4px; }\n.br-ov .br-ledger td .br-hint { margin-top: 2px; }\n.br-ov .br-batch td { background: color-mix(in srgb, var(--accent) 7%, transparent); border-bottom: 1px solid var(--border); }\n.br-ov .br-batch .br-batch-chips { display: flex; flex-wrap: wrap; gap: 6px 8px; align-items: center; }\n.br-ov .br-batch-chip { display: inline-flex; align-items: baseline; gap: 5px; padding: 2px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--card); font-size: 13px; }\n.br-ov .br-batch-chip b { color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.br-ov .br-batch-row td:first-child { white-space: nowrap; }\n.br-ov .br-how { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }\n.br-ov .br-how i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }\n.br-ov .br-acts { display: flex; gap: 6px; align-items: center; white-space: nowrap; }\n.br-ov .br-overlap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }\n.br-ov .br-funnel-rows { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 13px; }\n.br-ov .br-funnel-rows span { display: inline-flex; align-items: center; gap: 6px; }\n.br-ov .br-funnel-rows b { color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.br-ov .cto-notes li { line-height: 1.6; }\n.br-ov .cto-table tr.cto-row-pick.is-merged td { color: var(--text); }\n";
function Do({ entry: e, status: t, go: n, replace: r, reloadStatus: a, pollMs: s }) {
	let [c, l] = o(e.repo ?? "all"), [u, d] = o(e.state), [h, g] = o(14), _ = t?.repos ?? [], v = !!t && _.length === 0, y = D(v ? null : w.overview(c), s ?? 5e3), b = y.data, x = (e, t) => {
		l(e), d(t), g(14), r({
			kind: "overview",
			...e === "all" ? {} : { repo: e },
			...t ? { state: t } : {}
		});
	}, S = i(() => b ? Oo(b.rows.filter((e) => !u || e.state === u)) : [], [b, u]), C = (e, t = !1) => n({
		kind: "board",
		repo: e.repo,
		key: e.key,
		...t ? { replay: !0 } : {},
		from: "overview"
	}), T = (e) => n({
		kind: "item",
		repo: e.repo,
		key: e.key,
		from: "overview"
	}), E = (e) => b?.rows.find((t) => t.key === e)?.repo ?? (c === "all" ? _.find((e) => e.ok)?.id : c), O = (e) => {
		let t = E(e);
		t && C({
			repo: t,
			key: e
		});
	}, k = (e) => _.find((t) => t.id === e)?.name, A = c === "all" ? _.filter((e) => e.ok) : _.filter((e) => e.id === c);
	if (v) return /* @__PURE__ */ p("main", {
		className: "kt-root br-view cto-root br-ov",
		"data-testid": "overview",
		children: /* @__PURE__ */ p(Le, { onImport: () => n({ kind: "import" }) })
	});
	let j = b?.cto, N = new Map((j?.runs ?? []).map((e) => [`${e.repo}/${e.key}`, e])), P = (b?.rows ?? []).filter((e) => e.credits !== null && e.credits > 0).map((e) => ({
		key: e.key,
		credits: e.credits
	}));
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view cto-root br-ov",
		"data-testid": "overview",
		children: [
			/* @__PURE__ */ p("style", { children: Eo }),
			/* @__PURE__ */ m("header", {
				className: "cto-top",
				children: [
					/* @__PURE__ */ p("span", {
						className: "cto-tag is-real",
						title: "数字来自 brain-kit 的 evaluate 和这个 app 开的会话",
						children: "实测 · brain-kit"
					}),
					/* @__PURE__ */ m("span", {
						className: "cto-org",
						children: [
							A.length,
							" 个仓库 · ",
							b ? `${b.rows.length} 个需求` : "…",
							j?.ref ? ` · 读的是 ${j.ref}` : ""
						]
					}),
					/* @__PURE__ */ p("span", { className: "cto-grow" }),
					A.map((e) => /* @__PURE__ */ p(No, {
						repo: e.id,
						name: A.length > 1 ? e.name : "",
						onDone: y.reload
					}, e.id))
				]
			}),
			_.filter((e) => e.pending && (c === "all" || e.id === c)).map((e) => /* @__PURE__ */ p(Re, {
				repo: e,
				banner: !0,
				onOpen: () => n({
					kind: "import",
					path: e.path
				}),
				onDone: a
			}, e.id)),
			/* @__PURE__ */ p(Y, {
				loading: y.loading,
				error: y.error,
				has: !!b
			}),
			b?.errors.map((e) => /* @__PURE__ */ m("div", {
				className: "br-banner",
				role: "status",
				children: [
					k(e.repo) ?? e.repo,
					"：",
					e.error
				]
			}, e.repo)),
			b && j && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ m("section", {
					className: "cto-hero",
					"data-testid": "ov-hero",
					children: [/* @__PURE__ */ p("h2", { children: j.sentence }), /* @__PURE__ */ m("p", { children: [
						j.available ? `数字来自 brain-kit evaluate${j.ref ? `（${j.ref}）` : ""}：只算交接过、评估过的需求` : "brain-kit 的 evaluate 还没给出数字：先看 credits 和合并",
						" · ",
						"credits 来自这个 app 开的会话 · 口径见末尾"
					] })]
				}),
				_.length > 1 && /* @__PURE__ */ p("nav", {
					className: "cto-lines",
					"aria-label": "仓库",
					children: [{
						id: "all",
						name: "全部"
					}, ..._].map((e) => /* @__PURE__ */ m("button", {
						type: "button",
						"aria-pressed": c === e.id,
						disabled: "ok" in e && !e.ok,
						onClick: () => x(e.id, u),
						children: [/* @__PURE__ */ p("b", { children: e.name }), "ok" in e && !e.ok ? /* @__PURE__ */ p("span", { children: e.pending ? e.pending.word || "在分支上" : "读不到" }) : null]
					}, e.id))
				}),
				/* @__PURE__ */ m("section", {
					className: "cto-cards",
					"data-testid": "ov-cards",
					children: [
						/* @__PURE__ */ m("article", {
							className: `cto-card${j.unattended && j.unattended[1] && j.unattended[0] === j.unattended[1] ? " is-ok" : ""}`,
							"aria-label": "无人值守",
							"data-anchor": "unattended",
							children: [
								/* @__PURE__ */ p("div", {
									className: "cto-eyebrow",
									children: "无人值守"
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-value",
									"data-testid": "ov-unattended",
									children: j.unattended ? /* @__PURE__ */ m(f, { children: [j.unattended[0], /* @__PURE__ */ m("span", {
										className: "cto-of",
										children: ["/", j.unattended[1]]
									})] }) : "—"
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-desc",
									children: "交给运行机的需求里，交接以后没人插手就做完的"
								}),
								/* @__PURE__ */ p(ta, { c: j }),
								/* @__PURE__ */ p("div", {
									className: "cto-legend",
									children: [
										"unattended",
										"people",
										"pending",
										"local"
									].map((e) => /* @__PURE__ */ m("span", { children: [
										/* @__PURE__ */ p("i", {
											className: "cto-sw",
											style: { background: Ji[e] }
										}),
										qi[e],
										/* @__PURE__ */ p("b", {
											className: "br-strong",
											children: j.runs.filter((t) => t.how === e).length
										})
									] }, e))
								})
							]
						}),
						/* @__PURE__ */ m("article", {
							className: `cto-card${j.stepped_in && j.stepped_in.outside ? " is-wait" : ""}`,
							"aria-label": "人介入",
							"data-anchor": "people",
							children: [
								/* @__PURE__ */ p("div", {
									className: "cto-eyebrow",
									children: "人介入"
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-value",
									"data-testid": "ov-people",
									children: j.stepped_in ? /* @__PURE__ */ m(f, { children: [j.stepped_in.at_points + j.stepped_in.outside, /* @__PURE__ */ p("span", {
										className: "cto-of",
										children: "次"
									})] }) : "—"
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-desc",
									children: j.stepped_in ? `${j.stepped_in.at_points} 次落在判断点上（批准、驳回、回答），${j.stepped_in.outside} 次在判断点之外` : "评估以后才有"
								}),
								/* @__PURE__ */ p(na, { c: j }),
								j.stepped_in && j.stepped_in.outside > 0 && /* @__PURE__ */ p("div", {
									className: "cto-foot",
									children: /* @__PURE__ */ m("span", { children: ["判断点之外：", j.stepped_in.kinds.filter((e) => !e.point).map((e) => `${e.label} ${e.n}`).join("、")] })
								})
							]
						}),
						/* @__PURE__ */ m("article", {
							className: "cto-card",
							"aria-label": "每个需求的 credits",
							"data-anchor": "credits",
							children: [
								/* @__PURE__ */ p("div", {
									className: "cto-eyebrow",
									children: "每个需求的 credits"
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-value",
									"data-testid": "ov-credits",
									children: j.credits.per_req === null ? "—" : M(j.credits.per_req)
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-desc",
									children: j.credits.reqs ? `${j.credits.reqs} 个需求合计 ${M(j.credits.total)} credits` : "这个 app 开的会话还没报 credits"
								}),
								P.length > 0 && /* @__PURE__ */ p(ra, {
									rows: P,
									avg: j.credits.per_req,
									onKey: O
								}),
								/* @__PURE__ */ p("div", {
									className: "cto-foot",
									children: /* @__PURE__ */ p("span", { children: "KiroCrew 只报 credits，不报 token" })
								})
							]
						}),
						/* @__PURE__ */ p(jo, {
							f: b.funnel,
							onKey: O
						})
					]
				}),
				/* @__PURE__ */ p(sa, {
					weeks: j.weekly,
					onWeek: () => {
						x(c, "merged");
					}
				})
			] }),
			b && b.overlaps.length > 0 && /* @__PURE__ */ m("section", {
				className: "cto-card is-wait br-overlaps",
				"aria-label": "改同一处的需求",
				"data-testid": "overlaps",
				children: [/* @__PURE__ */ m("div", {
					className: "cto-chart-head",
					children: [/* @__PURE__ */ p("h3", { children: "这些需求要改同一处" }), /* @__PURE__ */ p("span", {
						className: "cto-dim",
						children: "先商量好谁先合，免得冲突"
					})]
				}), b.overlaps.map((e, t) => /* @__PURE__ */ m("div", {
					className: "br-overlap",
					children: [
						e.keys.map((e, t) => /* @__PURE__ */ m("span", {
							className: "br-row",
							style: { gap: 4 },
							children: [t > 0 && /* @__PURE__ */ p("span", {
								className: "br-dim",
								children: "和"
							}), /* @__PURE__ */ p("button", {
								type: "button",
								className: "br-link br-key",
								onClick: () => O(e),
								children: e
							})]
						}, e)),
						/* @__PURE__ */ p("span", {
							className: "br-dim",
							children: "都要改"
						}),
						e.paths.map((e) => /* @__PURE__ */ p("code", {
							className: "br-tag",
							children: e
						}, e))
					]
				}, t))]
			}),
			b && b.rows.length === 0 && /* @__PURE__ */ p(Ue, {
				title: "还没有需求",
				text: ["认领一个需求，交它的文档过五关，开工：它会在这里一路走到合并——在哪一步、等谁、花了多少。"],
				punch: "人只在判断点上出手：批准、回答、验收。",
				flow: [
					{
						icon: "new",
						title: "开需求",
						text: "认领，文档过五关"
					},
					{
						icon: "laptop",
						title: "本机开发",
						text: "brain-dev 带着 Lean"
					},
					{
						icon: "handover",
						title: "交给运行机",
						text: "无人值守地做"
					},
					{
						icon: "release",
						title: "验收",
						text: "产品在 MR 上验收"
					},
					{
						icon: "brain",
						title: "回写 Brain",
						text: "学到的留下来"
					}
				],
				children: /* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => n({
						kind: "new",
						...c === "all" ? {} : { repo: c }
					}),
					children: [/* @__PURE__ */ p(V, {
						role: "new",
						size: 17
					}), "开需求"]
				})
			}),
			b && b.rows.length > 0 && /* @__PURE__ */ p(Co, {
				rows: b.rows,
				at: b.at,
				hl: null,
				onOpen: (e) => C(e),
				onNew: () => n({
					kind: "new",
					...c === "all" ? {} : { repo: c }
				}),
				repoName: k
			}),
			b && b.rows.length > 0 && /* @__PURE__ */ m("section", {
				className: "cto-card",
				"aria-label": "交付清单",
				"data-anchor": "ledger",
				"data-testid": "ledger",
				children: [
					/* @__PURE__ */ m("div", {
						className: "cto-ledger-head",
						children: [
							/* @__PURE__ */ p("h3", { children: "交付清单" }),
							/* @__PURE__ */ p(Mo, {
								counts: b.counts,
								total: b.rows.length,
								value: u,
								onPick: (e) => x(c, e)
							}),
							/* @__PURE__ */ m("span", {
								className: "cto-dim",
								"data-testid": "ledger-count",
								children: [
									"共 ",
									S.length,
									" 个 · 点一行打开它的需求看板"
								]
							})
						]
					}),
					/* @__PURE__ */ p("div", {
						className: "br-scroll",
						children: /* @__PURE__ */ m("table", {
							className: "cto-table br-ledger",
							"data-testid": "req-table",
							children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
								/* @__PURE__ */ p("th", { children: "需求" }),
								/* @__PURE__ */ p("th", { children: "状态" }),
								/* @__PURE__ */ p("th", { children: "Lean" }),
								/* @__PURE__ */ p("th", { children: "在等" }),
								/* @__PURE__ */ p("th", { children: "交付方式" }),
								/* @__PURE__ */ p("th", {
									className: "is-num",
									children: "credits"
								}),
								/* @__PURE__ */ p("th", { children: "更新" }),
								/* @__PURE__ */ p("th", { children: "MR" }),
								/* @__PURE__ */ p("th", {})
							] }) }), /* @__PURE__ */ m("tbody", { children: [/* @__PURE__ */ p(Ao, {
								ev: b.eval,
								onKey: O
							}), S.slice(0, h).map((e) => /* @__PURE__ */ p(ko, {
								r: e,
								at: b.at,
								run: N.get(`${e.repo}/${e.key}`),
								repoName: _.length > 1 ? k(e.repo) : void 0,
								onOpen: () => C(e),
								onItem: () => T(e),
								onReplay: () => C(e, !0)
							}, `${e.repo}/${e.key}`))] })]
						})
					}),
					S.length > h && /* @__PURE__ */ m("button", {
						type: "button",
						className: "kt-btn is-small",
						style: { marginTop: 10 },
						onClick: () => g((e) => e + 30),
						children: [
							"显示更多（还有 ",
							S.length - h,
							" 个）"
						]
					})
				]
			}),
			b && /* @__PURE__ */ m("details", {
				className: "cto-notes",
				children: [/* @__PURE__ */ p("summary", { children: "口径" }), /* @__PURE__ */ m("ul", { children: [
					/* @__PURE__ */ p("li", { children: "无人值守：brain-kit evaluate 的「自主度」。交给运行机以后，除了必经的审批（需求、设计、计划、发布、验收），没有人做过任何事，而且交付正确（一次通过验收，合并后 14 天没有回滚、热修或缺陷）；14 天没满的、还没合并的算「还没评」，不算进分母。本机做完的需求是人自己带着 AI 做的，不算介入。" }),
					/* @__PURE__ */ p("li", { children: "人介入：「介入落在判断点」。判断点 = Lean 的审批口令（批准、驳回、没被接受的口令）和桥上的 park 问题；交接后推代码、允许改验收测试、平台上的手动操作都算判断点之外。" }),
					/* @__PURE__ */ p("li", { children: "每个需求的 credits：这个 app 给需求开的 Kiro Crew 会话报的 credits 合计 ÷ 有 credits 的需求数。KiroCrew 只报 credits，input / output / cache token 都是 0。" }),
					/* @__PURE__ */ m("li", { children: [
						"决定 · 谁定的：decisions.md 每一行的 Who（",
						"Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner",
						"）；每个决定只算一次，写了别的就算「没归类」，列出在哪一行，不猜是谁。"
					] }),
					/* @__PURE__ */ p("li", { children: "每周合并：合并进默认分支的那一周；交付方式同上，没评估过的合并算「还没评」。" })
				] })]
			})
		]
	});
}
function Oo(e) {
	let t = (e) => e.state === "merged" ? 1 : e.state === "closed" ? 2 : 0;
	return e.slice().sort((e, n) => t(e) - t(n) || (n.updated_at ?? 0) - (e.updated_at ?? 0));
}
function ko({ r: e, at: t, run: n, repoName: r, onOpen: i, onItem: a, onReplay: o }) {
	return /* @__PURE__ */ m("tr", {
		"data-key": e.key,
		className: `cto-row-pick${e.state === "merged" ? " is-merged" : ""}`,
		onClick: i,
		title: "需求看板",
		tabIndex: 0,
		onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), i()),
		children: [
			/* @__PURE__ */ m("td", { children: [/* @__PURE__ */ m("div", {
				className: "br-row",
				style: { gap: 6 },
				children: [
					/* @__PURE__ */ p("b", {
						className: "br-key",
						children: e.key
					}),
					/* @__PURE__ */ p("span", { children: e.title }),
					r && /* @__PURE__ */ p("span", {
						className: "cto-was",
						children: r
					}),
					e.open_questions.map((e) => /* @__PURE__ */ m("span", {
						className: "br-chip tone-wait",
						title: "还没回答的问题",
						children: [e, " 待答"]
					}, e)),
					e.overlap.length > 0 && /* @__PURE__ */ m("span", {
						className: "br-chip tone-warn",
						title: "和这些需求要改同一处",
						children: [
							"和 ",
							e.overlap.join("、"),
							" 重叠"
						]
					})
				]
			}), e.summary && /* @__PURE__ */ p("div", {
				className: "br-hint",
				"data-testid": "row-summary",
				title: "变更说明的第一行（brain mr-desc）",
				children: e.summary
			})] }),
			/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(U, {
				state: e.state,
				label: e.state_label
			}) }),
			/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(ve, {
				lean: e.lean,
				compact: !0
			}) }),
			/* @__PURE__ */ m("td", { children: [/* @__PURE__ */ p("div", {
				className: e.waits.who === "you" ? "br-strong" : void 0,
				children: e.waits.text
			}), e.waits.line && /* @__PURE__ */ p("div", {
				className: "cto-was",
				children: "在会话里自己打那一行"
			})] }),
			/* @__PURE__ */ p("td", { children: n ? /* @__PURE__ */ m("span", {
				className: "br-how",
				title: n.beyond.length ? `判断点之外：${n.beyond.join("、")}` : void 0,
				children: [
					/* @__PURE__ */ p("i", { style: { background: Ji[n.how] } }),
					qi[n.how],
					n.at_points || n.outside ? /* @__PURE__ */ m("span", {
						className: "cto-was",
						children: [
							"人 ",
							n.at_points,
							n.outside ? `+${n.outside}` : ""
						]
					}) : null
				]
			}) : /* @__PURE__ */ p("span", {
				className: "cto-was",
				children: "—"
			}) }),
			/* @__PURE__ */ p("td", {
				className: "is-num",
				children: M(e.credits)
			}),
			/* @__PURE__ */ p("td", {
				className: "cto-was",
				style: { whiteSpace: "nowrap" },
				children: j(e.updated_at, t)
			}),
			/* @__PURE__ */ p("td", {
				onClick: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ p(ye, { mr: e.mr })
			}),
			/* @__PURE__ */ p("td", {
				onClick: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ m("span", {
					className: "br-acts",
					children: [/* @__PURE__ */ p("button", {
						type: "button",
						className: "kt-btn is-small",
						onClick: a,
						title: "需求详情",
						children: "详情"
					}), e.state === "merged" && /* @__PURE__ */ p("button", {
						type: "button",
						className: "kt-btn is-small",
						onClick: o,
						title: "在需求看板上从头回放",
						children: "▶ 回放"
					})]
				})
			})
		]
	});
}
function Ao({ ev: e, onKey: t }) {
	return e.available ? /* @__PURE__ */ m(f, { children: [
		/* @__PURE__ */ p("tr", {
			className: "br-batch",
			"data-testid": "eval-batch",
			children: /* @__PURE__ */ m("td", {
				colSpan: 9,
				children: [/* @__PURE__ */ m("span", {
					className: "br-batch-chips",
					children: [/* @__PURE__ */ m("b", {
						className: "br-strong",
						children: ["这一批 Eval", e.ref ? `（${e.ref}）` : ""]
					}), e.metrics.map((e) => /* @__PURE__ */ m("span", {
						className: "br-batch-chip",
						"data-metric": e.id,
						title: e.rule,
						children: [e.label, /* @__PURE__ */ p("b", { children: e.value === null ? "—" : Array.isArray(e.value) ? `${e.value[0]}/${e.value[1]}` : e.value })]
					}, e.id))]
				}), e.notes.length > 0 && /* @__PURE__ */ p("div", {
					className: "cto-was",
					"data-testid": "eval-notes",
					children: e.notes.join("；")
				})]
			})
		}),
		e.queue.map((e) => /* @__PURE__ */ m("tr", {
			className: "br-batch br-batch-row",
			"data-testid": "eval-queue",
			children: [/* @__PURE__ */ m("td", { children: [
				/* @__PURE__ */ p("span", {
					className: "kt-pill tone-warn",
					children: "要复看"
				}),
				" ",
				/* @__PURE__ */ p("button", {
					type: "button",
					className: "br-link br-key",
					onClick: () => t(e.key),
					children: e.key
				})
			] }), /* @__PURE__ */ p("td", {
				colSpan: 8,
				children: e.reasons.join("；")
			})]
		}, `q-${e.key}`)),
		e.skipped.map((e) => /* @__PURE__ */ m("tr", {
			className: "br-batch br-batch-row",
			"data-testid": "eval-skipped",
			children: [/* @__PURE__ */ m("td", { children: [
				/* @__PURE__ */ p("span", {
					className: "kt-pill tone-idle",
					children: "跳过"
				}),
				" ",
				/* @__PURE__ */ p("b", {
					className: "br-key",
					children: e.key
				})
			] }), /* @__PURE__ */ m("td", {
				colSpan: 8,
				children: [/* @__PURE__ */ p("span", {
					className: "br-warn-text",
					children: "读不了，不算进数字："
				}), /* @__PURE__ */ p("span", {
					className: "br-pre",
					children: e.why
				})]
			})]
		}, `s-${e.key}`))
	] }) : /* @__PURE__ */ p("tr", {
		className: "br-batch",
		"data-testid": "eval-batch",
		children: /* @__PURE__ */ p("td", {
			colSpan: 9,
			children: /* @__PURE__ */ m("span", {
				className: "br-batch-chips",
				children: [/* @__PURE__ */ p("b", {
					className: "br-strong",
					children: "Eval"
				}), /* @__PURE__ */ p("span", {
					className: "cto-dim",
					children: e.error || "brain-kit 还没有 evaluate 模块"
				})]
			})
		})
	});
}
function jo({ f: e, onKey: t }) {
	let n = e.rows.find((e) => e.id === "person")?.count ?? 0;
	return /* @__PURE__ */ m("article", {
		className: `cto-card${e.unclassified.length ? " is-wait" : ""}`,
		"aria-label": "决定 · 谁定的",
		"data-testid": "funnel-card",
		children: [
			/* @__PURE__ */ p("div", {
				className: "cto-eyebrow",
				children: "决定 · 谁定的"
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-value",
				children: [e.total, /* @__PURE__ */ p("span", {
					className: "cto-of",
					children: "个决定"
				})]
			}),
			/* @__PURE__ */ m("div", {
				className: "cto-desc",
				children: [
					"人定了 ",
					n,
					" 个 · ",
					e.source === "evaluate" ? "数字来自 brain-kit evaluate" : "app 自己数的"
				]
			}),
			/* @__PURE__ */ p(ia, { rows: e.rows }),
			/* @__PURE__ */ p("div", {
				className: "br-funnel-rows",
				children: e.rows.filter((e) => e.count > 0).map((e) => /* @__PURE__ */ m("span", {
					"data-row": e.id,
					children: [
						/* @__PURE__ */ p("i", {
							className: "cto-sw",
							style: { background: aa[e.id] ?? "var(--s3)" }
						}),
						e.label,
						/* @__PURE__ */ p("b", { children: e.count })
					]
				}, e.id))
			}),
			e.unclassified.length > 0 && /* @__PURE__ */ m("div", {
				className: "cto-foot",
				"data-testid": "funnel-unclassified",
				children: [/* @__PURE__ */ m("span", {
					className: "br-warn-text",
					children: ["没归类：", e.unclassified.slice(0, 3).map((e) => /* @__PURE__ */ m("span", { children: [
						/* @__PURE__ */ m("button", {
							type: "button",
							className: "br-link",
							title: `在 ${e.src}`,
							onClick: () => t(e.key),
							children: [
								e.key,
								" ",
								e.id
							]
						}),
						e.src && /* @__PURE__ */ m("code", {
							className: "br-dim br-small",
							children: [" ", e.src]
						}),
						" "
					] }, `${e.key}-${e.id}`))]
				}), /* @__PURE__ */ p("span", {
					className: "cto-was",
					children: "Who 要写 agent、brain <条目号>、check、<化名> <凭证号> 或 owner"
				})]
			}),
			/* @__PURE__ */ p("div", {
				className: "cto-foot",
				"data-testid": "funnel-questions",
				children: /* @__PURE__ */ m("span", { children: [
					"问人 ",
					$(e.questions.asked),
					" 次 · 答了 ",
					$(e.questions.answered),
					" · 送回运行机 ",
					$(e.questions.delivered)
				] })
			})
		]
	});
}
function Mo({ counts: e, total: t, value: n, onPick: r }) {
	let i = To.filter((t) => (e[t] ?? 0) > 0 || t === n);
	return /* @__PURE__ */ m("div", {
		className: "cto-seg",
		role: "group",
		"aria-label": "按状态看",
		"data-testid": "state-filter",
		children: [/* @__PURE__ */ m("button", {
			type: "button",
			"aria-pressed": !n,
			onClick: () => r(void 0),
			children: ["全部 ", t]
		}), i.map((t) => /* @__PURE__ */ m("button", {
			type: "button",
			className: `tone-${ce[t]}`,
			"aria-pressed": n === t,
			onClick: () => r(n === t ? void 0 : t),
			children: [
				g[t],
				" ",
				e[t] ?? 0
			]
		}, t))]
	});
}
function No({ repo: e, name: t, onDone: n }) {
	let r = c(), i = O(() => r.post(w.refresh(), { repo: e })), a = async () => {
		await i.run() && n();
	};
	return /* @__PURE__ */ m("span", {
		className: "br-row",
		style: { gap: 6 },
		children: [
			i.result && /* @__PURE__ */ p("span", {
				className: `br-small ${i.result.ok ? "br-dim" : "br-bad-text"}`,
				role: "status",
				children: i.result.text
			}),
			i.error && /* @__PURE__ */ p("span", {
				className: "br-small br-bad-text",
				role: "alert",
				children: i.error
			}),
			/* @__PURE__ */ m("button", {
				type: "button",
				className: "kt-btn is-small",
				disabled: i.busy,
				onClick: () => void a(),
				title: "git fetch：读远端最新的分支和 main",
				children: [/* @__PURE__ */ p(H, {
					name: "RefreshCw",
					size: 13
				}), i.busy ? "正在取…" : `从远端取最新${t ? ` · ${t}` : ""}`]
			})
		]
	});
}
var Po = {
	signing: {
		label: "签名中",
		tone: "hand"
	},
	spooled: {
		label: "排队等工作区",
		tone: "idle"
	},
	ready: {
		label: "工作区好了",
		tone: "info"
	},
	dispatched: {
		label: "已派给会话",
		tone: "run"
	},
	send_unknown: {
		label: "送没送到不清楚",
		tone: "warn"
	},
	failed: {
		label: "工作区没建成",
		tone: "bad"
	},
	merged: {
		label: "已合并",
		tone: "ok"
	},
	closed: {
		label: "已关闭",
		tone: "idle"
	}
}, Fo = (e) => Po[e] ?? {
	label: e,
	tone: "idle"
}, Io = {
	checking: {
		label: "在检查",
		tone: "run"
	},
	accepted: {
		label: "已接手",
		tone: "ok"
	},
	rejected: {
		label: "拒绝接手",
		tone: "bad"
	}
}, Lo = {
	accepted: {
		label: "接手了",
		tone: "ok",
		hint: ""
	},
	rejected: {
		label: "拒绝接手",
		tone: "bad",
		hint: "原因在 MR 上（AI 接手被拒）"
	},
	seen: {
		label: "看过了",
		tone: "idle",
		hint: "这个提交和这次打标签以前检查过，结果在账本里"
	},
	unlabelled: {
		label: "标签刚被拿掉",
		tone: "warn",
		hint: "最新的标签事件拿掉了交接标签（brain handoff 重打标签时会这样）：下一轮再看"
	},
	waiting: {
		label: "正在别处签名",
		tone: "hand",
		hint: "这份交接的合同正在别处签（另一个桥进程，或停下的桥留下的占位）：下一轮再看"
	},
	error: {
		label: "这一轮没查成",
		tone: "warn",
		hint: "下一轮再试"
	}
}, Ro = (e) => Lo[e] ?? {
	label: e,
	tone: "idle",
	hint: ""
}, zo = {
	rejected: "is-conflict",
	waiting: "is-pending",
	unlabelled: "is-pending",
	error: "is-pending",
	seen: "is-seen"
}, Bo = (e, t) => e === "runs" ? Fo(t) : e === "decisions" ? he(t) : Io[t] ?? {
	label: t,
	tone: "idle"
}, Vo = [
	{
		icon: "handover",
		title: "交接",
		text: "MR 打上交接标签"
	},
	{
		icon: "bridge",
		title: "桥",
		text: "每一轮看 MR，检查交接"
	},
	{
		icon: "signer",
		title: "签名",
		text: "单独的签名服务签合同"
	},
	{
		icon: "runner",
		title: "运行机会话",
		text: "brain-run 接着做"
	},
	{
		icon: "release",
		title: "MR 上回答、验收",
		text: "以 GitLab 身份"
	}
];
function Ho({ status: e, go: t, reloadStatus: n, pollMs: r }) {
	let i = c(), a = u(), o = !!e?.app.team, s = D(o ? w.team() : null, r ?? 1e4), l = O(() => i.post(w.teamLoop(), {})), d = async () => {
		await l.run() && (s.reload(), n());
	};
	if (e && !o) return /* @__PURE__ */ m("main", {
		className: "kt-root br-view tm-root",
		"data-testid": "team",
		children: [/* @__PURE__ */ p("style", { children: Jo }), /* @__PURE__ */ p(Ue, {
			testid: "team-off",
			title: "这台机器不是团队运行机",
			text: ["这台机器没开团队模式。要当团队运行机，在设置里打开团队模式，填上桥（bridge.json）和 runnerd 的配置。"],
			punch: "运行机接手交接过来的需求，问题和验收都在 MR 上，以 GitLab 身份回答。",
			flow: Vo,
			children: /* @__PURE__ */ m("button", {
				type: "button",
				className: "br-btn is-primary",
				onClick: () => t({ kind: "settings" }),
				children: [/* @__PURE__ */ p(V, {
					role: "settings",
					size: 16
				}), "去设置"]
			})
		})]
	});
	let h = s.data, g = h?.status ?? e?.team, _ = g ? g.enabled ? g.ok ? {
		label: "正常",
		tone: "ok"
	} : {
		label: "有问题",
		tone: "bad"
	} : {
		label: "没开",
		tone: "idle"
	} : null;
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view tm-root",
		"data-testid": "team",
		children: [
			/* @__PURE__ */ p("style", { children: Jo }),
			g?.same_user && /* @__PURE__ */ p("div", {
				className: "br-banner tm-same",
				role: "alert",
				"data-testid": "signer-same-user",
				children: /* @__PURE__ */ m("span", {
					className: "br-row",
					children: [/* @__PURE__ */ p(V, {
						role: "signer",
						size: 18
					}), /* @__PURE__ */ p("b", {
						className: "br-strong",
						children: "签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用"
					})]
				})
			}),
			/* @__PURE__ */ m("header", {
				className: "tm-top",
				children: [/* @__PURE__ */ p(V, {
					role: "runner",
					size: 26,
					className: "tm-top-icon"
				}), /* @__PURE__ */ m("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ p("h2", { children: "运行机" }), /* @__PURE__ */ p("p", { children: "团队运行机：交接、运行、签名" })]
				})]
			}),
			/* @__PURE__ */ p(Y, {
				loading: s.loading,
				error: s.error,
				has: !!h
			}),
			g && _ && /* @__PURE__ */ m("section", {
				className: `br-card tm-status is-${_.tone === "ok" ? "ok" : _.tone === "bad" ? "bad" : "idle"}`,
				"aria-label": "运行机状态",
				children: [
					/* @__PURE__ */ m("div", {
						className: "tm-status-row",
						children: [
							/* @__PURE__ */ p("span", {
								className: "tm-status-icon",
								children: /* @__PURE__ */ p(V, {
									role: "bridge",
									size: 30
								})
							}),
							/* @__PURE__ */ m("div", {
								className: "tm-status-main",
								children: [/* @__PURE__ */ m("div", {
									className: "br-row",
									children: [/* @__PURE__ */ p("h3", { children: "桥" }), /* @__PURE__ */ m("span", {
										className: `br-chip kt-pill tone-${_.tone}${g.enabled && g.ok ? " is-live" : ""}`,
										children: [/* @__PURE__ */ p("i", {
											"aria-hidden": "true",
											children: "●"
										}), _.label]
									})]
								}), /* @__PURE__ */ m("div", {
									className: "tm-facts",
									children: [/* @__PURE__ */ m("span", { children: ["上一轮 ", /* @__PURE__ */ p("b", { children: g.last_loop_at ? j(g.last_loop_at) : "还没跑过" })] }), /* @__PURE__ */ m("span", { children: ["签名 ", /* @__PURE__ */ m("b", { children: [
										"等签名 ",
										g.signer.pending,
										" · 拒签 ",
										g.signer.refused
									] })] })]
								})]
							}),
							/* @__PURE__ */ p("span", { className: "br-grow" }),
							/* @__PURE__ */ m("button", {
								type: "button",
								className: "br-btn is-primary is-big",
								disabled: l.busy || !g.enabled,
								onClick: () => void d(),
								children: [/* @__PURE__ */ p(H, {
									name: "Play",
									size: 15
								}), l.busy ? "正在跑…" : "现在跑一轮"]
							})
						]
					}),
					g.error && /* @__PURE__ */ p("p", {
						className: "br-error br-pre",
						children: g.error
					}),
					g.loop_error && /* @__PURE__ */ m("p", {
						className: "br-pre br-bad-text",
						children: [/* @__PURE__ */ p("b", { children: "上一轮出错：" }), g.loop_error]
					}),
					l.result && /* @__PURE__ */ m("div", {
						className: `tm-loop ${l.result.ok ? "is-ok" : "is-bad"}`,
						role: "status",
						"data-testid": "loop-result",
						children: [
							/* @__PURE__ */ p("b", { children: l.result.ok ? "这一轮跑完了" : "这一轮没跑成" }),
							Object.entries(l.result.summary).map(([e, t]) => /* @__PURE__ */ m("span", {
								className: "br-tag",
								children: [
									e,
									" ",
									t
								]
							}, e)),
							l.result.error && /* @__PURE__ */ p("span", {
								className: "br-bad-text br-pre",
								children: l.result.error
							})
						]
					}),
					l.error && /* @__PURE__ */ p("p", {
						className: "br-error",
						role: "alert",
						children: l.error
					})
				]
			}),
			h && /* @__PURE__ */ m(f, { children: [
				/* @__PURE__ */ m("section", {
					className: "br-kpis tm-kpis",
					"aria-label": "账本",
					children: [
						/* @__PURE__ */ p(Uo, {
							k: "runs",
							label: "运行",
							unit: "个",
							counts: h.ledger.runs
						}),
						/* @__PURE__ */ p(Uo, {
							k: "decisions",
							label: "问题",
							unit: "个",
							counts: h.ledger.decisions
						}),
						/* @__PURE__ */ p(Uo, {
							k: "handoffs",
							label: "交接",
							unit: "次",
							counts: h.ledger.handoffs,
							big: "accepted"
						}),
						/* @__PURE__ */ p(Wo, { signer: h.signer })
					]
				}),
				/* @__PURE__ */ p(Go, {
					rows: h.handovers,
					at: g?.last_loop_at ?? null
				}),
				/* @__PURE__ */ m("section", {
					className: "br-card",
					"aria-label": "运行",
					children: [/* @__PURE__ */ m("header", { children: [
						/* @__PURE__ */ p(V, {
							role: "runner",
							size: 18
						}),
						/* @__PURE__ */ p("h3", { children: "运行" }),
						/* @__PURE__ */ m("span", {
							className: "br-dim br-small",
							children: [h.runs.length, " 个"]
						})
					] }), h.runs.length === 0 ? /* @__PURE__ */ p("p", {
						className: "br-empty",
						children: "还没有运行：MR 打上交接标签、桥接手以后，就会出现在这里。"
					}) : /* @__PURE__ */ p("div", {
						className: "br-scroll",
						children: /* @__PURE__ */ m("table", {
							className: "cto-table tm-runs",
							children: [/* @__PURE__ */ p("thead", { children: /* @__PURE__ */ m("tr", { children: [
								/* @__PURE__ */ p("th", { children: "运行" }),
								/* @__PURE__ */ p("th", { children: "需求" }),
								/* @__PURE__ */ p("th", { children: "项目" }),
								/* @__PURE__ */ p("th", { children: "状态" }),
								/* @__PURE__ */ p("th", { children: "MR" }),
								/* @__PURE__ */ p("th", { children: "更新" }),
								/* @__PURE__ */ p("th", { children: "会话" })
							] }) }), /* @__PURE__ */ p("tbody", { children: h.runs.map((e) => /* @__PURE__ */ m("tr", {
								"data-state": e.state,
								children: [
									/* @__PURE__ */ p("td", {
										className: "br-mono",
										children: e.run_id
									}),
									/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p("button", {
										type: "button",
										className: "br-link br-key",
										onClick: () => t({
											kind: "item",
											repo: "runner",
											key: e.req
										}),
										children: e.req
									}) }),
									/* @__PURE__ */ p("td", {
										className: "br-dim",
										children: e.project
									}),
									/* @__PURE__ */ p("td", { children: /* @__PURE__ */ p(qo, { state: e.state }) }),
									/* @__PURE__ */ p("td", { children: /* @__PURE__ */ m(K, {
										href: e.mr_url,
										children: ["!", e.iid]
									}) }),
									/* @__PURE__ */ p("td", {
										className: "br-dim",
										children: L(e.updated)
									}),
									/* @__PURE__ */ p("td", { children: e.slot ? /* @__PURE__ */ m("button", {
										type: "button",
										className: "br-btn is-small",
										onClick: () => a(`/chat?sid=${encodeURIComponent(e.slot)}`),
										children: [/* @__PURE__ */ p(H, {
											name: "MessageSquare",
											size: 13
										}), "打开会话"]
									}) : /* @__PURE__ */ p("span", {
										className: "br-dim",
										children: "—"
									}) })
								]
							}, e.run_id)) })]
						})
					})]
				}),
				/* @__PURE__ */ p(Ko, { signer: h.signer })
			] })
		]
	});
}
function Uo({ k: e, label: t, unit: n, counts: r, big: i }) {
	let a = Object.entries(r).filter(([, e]) => e > 0), o = a.reduce((e, [, t]) => e + t, 0), s = i ? r[i] ?? 0 : o;
	return /* @__PURE__ */ m("div", {
		className: "br-kpi tm-kpi",
		"data-ledger": e,
		children: [
			/* @__PURE__ */ p("div", {
				className: "br-kpi-label",
				children: t
			}),
			/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
				className: "br-kpi-big",
				children: s
			}), /* @__PURE__ */ p("span", {
				className: "br-kpi-of",
				children: i ? `/${o}` : n
			})] }),
			o > 0 ? /* @__PURE__ */ p("div", {
				className: "tm-stack",
				role: "img",
				"aria-label": a.map(([t, n]) => `${Bo(e, t).label} ${n}`).join("，"),
				children: a.map(([t, n]) => /* @__PURE__ */ p("i", {
					className: `tone-${Bo(e, t).tone}`,
					style: { flexGrow: n }
				}, t))
			}) : /* @__PURE__ */ p("div", {
				className: "tm-stack is-empty",
				"aria-hidden": "true",
				children: /* @__PURE__ */ p("i", {})
			}),
			/* @__PURE__ */ p("div", {
				className: "tm-legs",
				children: a.length === 0 ? /* @__PURE__ */ p("span", {
					className: "br-dim",
					children: "—"
				}) : a.map(([t, n]) => /* @__PURE__ */ m("span", {
					className: "tm-leg",
					title: t,
					children: [
						/* @__PURE__ */ p("i", {
							className: `tone-${Bo(e, t).tone}`,
							"aria-hidden": "true"
						}),
						Bo(e, t).label,
						" ",
						/* @__PURE__ */ p("b", { children: n })
					]
				}, t))
			})
		]
	});
}
function Wo({ signer: e }) {
	let t = e.pending.length, n = e.refused.length, r = e.waiting.length;
	return /* @__PURE__ */ m("div", {
		className: `br-kpi tm-kpi${t ? " is-wait" : n ? " is-bad" : ""}`,
		"data-ledger": "signer",
		children: [
			/* @__PURE__ */ p("div", {
				className: "br-kpi-label",
				children: "签名"
			}),
			/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
				className: "br-kpi-big",
				children: t
			}), /* @__PURE__ */ p("span", {
				className: "br-kpi-of",
				children: "等签名"
			})] }),
			/* @__PURE__ */ m("div", {
				className: "tm-cells",
				"aria-hidden": "true",
				children: [
					e.pending.map((e) => /* @__PURE__ */ p("i", {
						className: "is-wait",
						title: e.req_id
					}, e.req_id)),
					e.refused.map((e) => /* @__PURE__ */ p("i", {
						className: "is-bad",
						title: e.req_id
					}, e.req_id)),
					e.waiting.map((e) => /* @__PURE__ */ p("i", {
						className: "is-warn",
						title: e.ref
					}, e.ref))
				]
			}),
			/* @__PURE__ */ m("div", {
				className: "br-kpi-note",
				children: [
					"拒签 ",
					/* @__PURE__ */ p("b", {
						className: n ? "br-bad-text" : "",
						children: n
					}),
					" · 上一轮没等到 ",
					/* @__PURE__ */ p("b", { children: r })
				]
			})
		]
	});
}
function Go({ rows: e, at: t }) {
	let n = e.filter((e) => e.result === "accepted").length, r = e.filter((e) => e.result === "rejected").length, i = e.filter((e) => e.result === "waiting" || e.result === "unlabelled" || e.result === "error").length;
	return /* @__PURE__ */ m("section", {
		className: "kt-card tm-ho",
		"aria-label": "交接",
		"data-testid": "handovers",
		children: [/* @__PURE__ */ m("header", {
			className: "kt-card-head",
			children: [
				/* @__PURE__ */ p(V, {
					role: "handover",
					size: 18
				}),
				/* @__PURE__ */ p("h2", { children: "交接" }),
				/* @__PURE__ */ p("span", {
					className: "kt-dim",
					children: "上一轮看到的打着交接标签的 MR"
				}),
				/* @__PURE__ */ p("span", { className: "kt-grow" }),
				e.length > 0 && /* @__PURE__ */ m("span", {
					className: "br-row br-small",
					children: [
						n > 0 && /* @__PURE__ */ m("span", {
							className: "tone-ok",
							children: ["接手 ", n]
						}),
						r > 0 && /* @__PURE__ */ m("span", {
							className: "tone-bad",
							children: ["拒绝 ", r]
						}),
						i > 0 && /* @__PURE__ */ m("span", {
							className: "tone-warn",
							children: ["下一轮再看 ", i]
						})
					]
				})
			]
		}), e.length === 0 ? /* @__PURE__ */ p("p", {
			className: "br-empty",
			children: "上一轮没有打着交接标签的 MR。"
		}) : /* @__PURE__ */ m("ol", {
			className: "kt-belt tm-belt",
			children: [
				/* @__PURE__ */ m("li", {
					className: "kt-belt-end",
					title: "桥上一轮看 MR 的时候",
					children: [
						/* @__PURE__ */ p(V, {
							role: "bridge",
							size: 14
						}),
						"上一轮",
						t ? ` · ${j(t)}` : ""
					]
				}),
				e.map((e) => {
					let t = Ro(e.result), n = e.error || t.hint;
					return /* @__PURE__ */ m("li", {
						className: `kt-belt-chip ${zo[e.result] ?? ""}`,
						"data-result": e.result,
						children: [
							/* @__PURE__ */ m("span", {
								className: "tm-chip-top",
								children: [/* @__PURE__ */ m(K, {
									href: e.mr_url,
									className: "kt-belt-role tm-mr",
									children: [
										e.project,
										"!",
										e.iid
									]
								}), /* @__PURE__ */ p("span", {
									className: `kt-pill tone-${t.tone}`,
									children: t.label
								})]
							}),
							e.sha && /* @__PURE__ */ p("span", {
								className: "kt-belt-meta",
								children: /* @__PURE__ */ p("code", { children: e.sha.slice(0, 12) })
							}),
							n && /* @__PURE__ */ p("span", {
								className: "tm-hint",
								children: n
							})
						]
					}, `${e.project}!${e.iid}`);
				}),
				/* @__PURE__ */ m("li", {
					className: "kt-belt-end is-head",
					title: "接手的交接在运行机上接着做",
					children: [/* @__PURE__ */ p(V, {
						role: "runner",
						size: 14
					}), "运行机"]
				})
			]
		})]
	});
}
function Ko({ signer: e }) {
	return /* @__PURE__ */ m("section", {
		className: "br-card",
		"aria-label": "签名",
		children: [/* @__PURE__ */ m("header", { children: [
			/* @__PURE__ */ p(V, {
				role: "signer",
				size: 18
			}),
			/* @__PURE__ */ p("h3", { children: "签名" }),
			/* @__PURE__ */ p("span", {
				className: "br-dim br-small",
				children: "单独的签名服务：交接的合同、回答的凭证"
			})
		] }), /* @__PURE__ */ m("div", {
			className: "tm-signer",
			children: [
				/* @__PURE__ */ m("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ m("h4", { children: ["等签名 ", /* @__PURE__ */ p("span", {
						className: "kt-badge tone-wait",
						children: e.pending.length
					})] }), e.pending.length === 0 ? /* @__PURE__ */ p("p", {
						className: "br-empty",
						children: "没有。"
					}) : /* @__PURE__ */ p("ul", {
						className: "tm-sigs",
						children: e.pending.map((e) => /* @__PURE__ */ m("li", {
							className: "tm-sig is-wait",
							children: [/* @__PURE__ */ m("span", {
								className: "br-row",
								children: [
									/* @__PURE__ */ p("b", {
										className: "br-mono",
										children: e.req_id
									}),
									/* @__PURE__ */ p("span", {
										className: "br-tag",
										children: e.kind
									}),
									/* @__PURE__ */ p("span", { className: "br-grow" }),
									/* @__PURE__ */ p("span", {
										className: "br-dim br-small",
										children: L(e.since)
									})
								]
							}), /* @__PURE__ */ p("span", {
								className: "br-mono br-dim br-small",
								children: e.run_id
							})]
						}, e.req_id))
					})]
				}),
				/* @__PURE__ */ m("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ m("h4", { children: ["拒签 ", /* @__PURE__ */ p("span", {
						className: "kt-badge tone-bad",
						children: e.refused.length
					})] }), e.refused.length === 0 ? /* @__PURE__ */ p("p", {
						className: "br-empty",
						children: "没有。"
					}) : /* @__PURE__ */ p("ul", {
						className: "tm-sigs",
						children: e.refused.map((e) => /* @__PURE__ */ m("li", {
							className: "tm-sig is-bad",
							children: [/* @__PURE__ */ m("span", {
								className: "br-row",
								children: [/* @__PURE__ */ p("b", {
									className: "br-mono",
									children: e.req_id
								}), /* @__PURE__ */ p("span", {
									className: "br-tag",
									children: e.kind
								})]
							}), /* @__PURE__ */ p("ul", {
								className: "br-list br-bad-text",
								children: e.reasons.map((e, t) => /* @__PURE__ */ p("li", { children: e }, t))
							})]
						}, e.req_id))
					})]
				}),
				e.waiting.length > 0 && /* @__PURE__ */ m("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ p("h4", { children: "上一轮没等到签名（下一轮再要同一张凭证）" }), /* @__PURE__ */ p("ul", {
						className: "tm-sigs",
						"data-testid": "signer-waiting",
						children: e.waiting.map((e) => /* @__PURE__ */ m("li", {
							className: "tm-sig is-warn",
							children: [/* @__PURE__ */ m("span", {
								className: "br-row",
								children: [
									/* @__PURE__ */ p("b", {
										className: "br-mono",
										children: e.ref
									}),
									/* @__PURE__ */ p("span", {
										className: "br-tag",
										children: e.kind
									}),
									/* @__PURE__ */ p("span", { className: "br-grow" }),
									/* @__PURE__ */ p("span", {
										className: "br-dim br-small",
										children: L(e.since)
									})
								]
							}), /* @__PURE__ */ p("span", {
								className: "br-mono br-dim br-small",
								children: e.run_id
							})]
						}, e.ref))
					})]
				})
			]
		})]
	});
}
function qo({ state: e }) {
	let t = Fo(e), n = e === "dispatched" || e === "signing";
	return /* @__PURE__ */ p("span", {
		className: `br-chip kt-pill tone-${t.tone}${n ? " is-live" : ""}`,
		"data-state": e,
		children: t.label
	});
}
var Jo = "\n.tm-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.tm-top-icon { color: var(--accent); }\n.tm-same .kt-role-icon { color: var(--kt-warn); }\n.tm-status { gap: .7em; }\n.tm-status.is-ok { border-color: var(--kit-ok); }\n.tm-status.is-bad { border-color: var(--kit-bad); }\n.tm-status-row { display: flex; align-items: center; gap: .8em 1.2em; flex-wrap: wrap; }\n.tm-status-icon { display: grid; place-items: center; width: 3.2em; height: 3.2em; border-radius: .9em; color: var(--text-strong);\n  border: 1px solid var(--border); background: var(--kt-glass); }\n.tm-status.is-ok .tm-status-icon { color: var(--kt-ok); border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 10%, transparent); }\n.tm-status.is-bad .tm-status-icon { color: var(--kt-bad); border-color: var(--kit-bad); }\n.tm-status-main { display: grid; gap: .3em; }\n.tm-status-main h3 { font-size: 1.25em; }\n.tm-facts { display: flex; gap: .3em 1.4em; flex-wrap: wrap; color: var(--muted); font-size: .93em; }\n.tm-facts b { color: var(--text-strong); font-weight: 650; }\n.tm-loop { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; padding: .5em .8em; border-radius: var(--kit-r-cell, 10px); }\n.tm-loop.is-ok { background: color-mix(in srgb, var(--kt-ok) 9%, transparent); border: 1px solid var(--kit-ok); }\n.tm-loop.is-ok > b { color: var(--kt-ok); }\n.tm-loop.is-bad { background: color-mix(in srgb, var(--kt-bad) 9%, transparent); border: 1px solid var(--kit-bad); }\n.tm-loop.is-bad > b { color: var(--kt-bad); }\n.tm-kpis { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n@media (max-width: 1100px) { .tm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.tm-stack { display: flex; gap: 2px; height: .75em; margin-top: .2em; border-radius: .3em; overflow: hidden; }\n.tm-stack i { flex: 1 1 0; min-width: .4em; background: var(--kt-tone); }\n.tm-stack.is-empty i { background: color-mix(in srgb, var(--muted) 22%, transparent); }\n.tm-legs { display: flex; flex-wrap: wrap; gap: .25em .9em; font-size: .84em; color: var(--text); }\n.tm-leg { display: inline-flex; align-items: center; gap: .4em; white-space: nowrap; }\n.tm-leg i { width: .7em; height: .7em; border-radius: 2px; background: var(--kt-tone); flex: none; }\n.tm-leg b { color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.tm-cells { display: flex; flex-wrap: wrap; gap: 4px; min-height: 1.4em; margin-top: .2em; }\n.tm-cells i { width: 1.4em; height: 1.4em; border-radius: .4em; border: 2px solid var(--kt-c); background: color-mix(in srgb, var(--kt-c) 22%, transparent); }\n.tm-cells i.is-wait { --kt-c: var(--kt-approve); } .tm-cells i.is-bad { --kt-c: var(--kt-bad); } .tm-cells i.is-warn { --kt-c: var(--kt-warn); border-style: dashed; }\n.tm-belt { align-items: stretch; padding-top: .5em; padding-bottom: .5em; }\n.tm-belt > li.kt-belt-end { align-self: center; }\n.tm-belt .kt-belt-chip { gap: .25em; max-width: 26em; padding: .55em .8em .6em; }\n.tm-belt .kt-belt-chip.is-pending { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, var(--card)); }\n.tm-belt .kt-belt-chip.is-seen { border: 1px solid var(--border); background: var(--card); }\n.tm-chip-top { display: flex; align-items: center; gap: .6em; }\n.tm-mr { display: inline-flex; align-items: center; gap: .25em; text-decoration: none; }\n.tm-mr:hover { text-decoration: underline; }\n.tm-hint { font-size: .8em; color: var(--text); white-space: normal; line-height: 1.4; }\n.tm-runs td { vertical-align: middle; }\n.tm-signer { display: grid; grid-template-columns: repeat(auto-fit, minmax(20em, 1fr)); gap: var(--kit-gap-row, 12px); align-items: start; }\n.tm-sig-col { display: grid; gap: .5em; }\n.tm-sig-col h4 { margin: 0; display: flex; align-items: center; gap: .5em; font-size: .93em; color: var(--text-strong); }\n.tm-sigs { list-style: none; margin: 0; padding: 0; display: grid; gap: .5em; }\n.tm-sig { display: grid; gap: .3em; padding: .6em .8em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }\n.tm-sig.is-wait { border-color: var(--kit-wait); }\n.tm-sig.is-bad { border-color: var(--kit-bad); background: color-mix(in srgb, var(--kt-bad) 6%, var(--card)); }\n.tm-sig.is-warn { border-style: dashed; border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n", Yo = "bridge.json：带 \"signer\": {\"type\": \"spool\", \"spool_dir\", \"allowed_signers\"}，不写 signing_key", Xo = (e) => ({
	brainkit: e.brainkit,
	work_root: e.work_root,
	team: { ...e.team }
}), Zo = (e) => ({
	brainkit: e.brainkit.trim(),
	work_root: e.work_root.trim(),
	team: { ...e.team }
}), Qo = [[
	"bridge_config",
	"bridge 的配置",
	"bridge.json"
], [
	"runnerd_config",
	"runnerd 的配置",
	"runnerd.json"
]];
function $o({ status: e, setStatus: t, reloadStatus: n, go: i }) {
	let a = c(), s = D(w.settings(), 0), [l, u] = o(null), [d, f] = o(!1);
	r(() => {
		s.data && !l && u(Xo(s.data));
	}, [s.data]);
	let h = O((e) => a.post(w.settings(), e)), g = (e) => {
		f(!1), u((t) => t && {
			...t,
			...e
		});
	}, _ = (e) => g({ team: {
		...l.team,
		...e
	} }), v = async () => {
		if (!l) return;
		let e = await h.run(Zo(l));
		e && (u(Xo(e.settings)), t(e.status), f(e.ok));
	}, y = (e) => i({
		kind: "import",
		...e ? { path: e } : {}
	}), b = /* @__PURE__ */ m("section", {
		className: "br-card st-form",
		"aria-label": "设置",
		children: [
			/* @__PURE__ */ m("header", { children: [
				/* @__PURE__ */ p(V, {
					role: "settings",
					size: 18
				}),
				/* @__PURE__ */ p("h3", { children: "设置" }),
				/* @__PURE__ */ p("span", {
					className: "br-dim br-small",
					children: "存在 app 自己的数据目录里"
				})
			] }),
			/* @__PURE__ */ p(Y, {
				loading: s.loading,
				error: s.error,
				has: !!l
			}),
			l && /* @__PURE__ */ m("form", {
				className: "br-form",
				onSubmit: (e) => {
					e.preventDefault(), v();
				},
				children: [
					/* @__PURE__ */ m("div", {
						className: "st-fields",
						children: [/* @__PURE__ */ m("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ p("label", {
									htmlFor: "set-brainkit",
									children: "brain-kit 在哪"
								}),
								/* @__PURE__ */ p("input", {
									id: "set-brainkit",
									type: "text",
									className: "br-mono",
									value: l.brainkit,
									onChange: (e) => g({ brainkit: e.target.value })
								}),
								/* @__PURE__ */ p("p", {
									className: "br-hint",
									children: "app 只读它，不改它。"
								})
							]
						}), /* @__PURE__ */ m("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ p("label", {
									htmlFor: "set-work",
									children: "每个需求的工作目录放在哪"
								}),
								/* @__PURE__ */ p("input", {
									id: "set-work",
									type: "text",
									className: "br-mono",
									value: l.work_root,
									onChange: (e) => g({ work_root: e.target.value })
								}),
								/* @__PURE__ */ p("p", {
									className: "br-hint",
									children: "要在 ~/workplace 或 ~/workspace 下面：KiroCrew 只让 agent 在那里干活。"
								})
							]
						})]
					}),
					/* @__PURE__ */ m("fieldset", {
						className: `br-fieldset st-team${l.team.enabled ? " is-on" : ""}`,
						children: [
							/* @__PURE__ */ p("legend", { children: "团队模式" }),
							/* @__PURE__ */ m("div", {
								className: "st-toggle",
								children: [/* @__PURE__ */ m("label", {
									className: "br-check",
									children: [/* @__PURE__ */ p("input", {
										type: "checkbox",
										"aria-describedby": "set-team-hint",
										checked: l.team.enabled,
										onChange: (e) => _({ enabled: e.target.checked })
									}), /* @__PURE__ */ p("b", { children: "这台机器是团队运行机" })]
								}), /* @__PURE__ */ p("p", {
									className: "br-hint",
									id: "set-team-hint",
									children: "跑桥：看 MR 上的交接，派给运行机会话"
								})]
							}),
							/* @__PURE__ */ p("div", {
								className: "st-fields",
								children: Qo.map(([e, t, n]) => /* @__PURE__ */ m("div", {
									className: "br-field",
									children: [
										/* @__PURE__ */ p("label", {
											htmlFor: `set-${e}`,
											children: t
										}),
										/* @__PURE__ */ p("input", {
											id: `set-${e}`,
											type: "text",
											className: "br-mono",
											value: l.team[e],
											placeholder: n,
											onChange: (t) => _({ [e]: t.target.value })
										}),
										e === "bridge_config" && /* @__PURE__ */ m("p", {
											className: "br-hint",
											children: [Yo, "。签名服务的目录和公钥都写在这里面。"]
										})
									]
								}, e))
							}),
							/* @__PURE__ */ m("label", {
								className: "br-check",
								children: [/* @__PURE__ */ p("input", {
									type: "checkbox",
									checked: l.team.dev_same_user,
									onChange: (e) => _({ dev_same_user: e.target.checked })
								}), /* @__PURE__ */ p("span", { children: "本机试用：签名器和 app 用同一个系统用户" })]
							}),
							l.team.dev_same_user && /* @__PURE__ */ p("p", {
								className: "br-banner br-small",
								role: "note",
								"data-testid": "same-user-warning",
								children: "签名器和 app 用同一个系统用户，签名私钥这个用户就能读到，签名挡不住 app 自己：只适合本机试用，不能用在正式的运行机上。"
							})
						]
					}),
					/* @__PURE__ */ m("div", {
						className: "br-row",
						children: [
							/* @__PURE__ */ p("button", {
								type: "submit",
								className: "br-btn is-primary",
								disabled: h.busy,
								children: h.busy ? "正在保存…" : "保存"
							}),
							d && /* @__PURE__ */ p("span", {
								className: "br-ok-text",
								role: "status",
								children: "已保存"
							}),
							h.result && !h.result.ok && /* @__PURE__ */ p("span", {
								className: "br-bad-text",
								role: "status",
								children: "没保存成：看上面的状态"
							}),
							h.error && /* @__PURE__ */ p("span", {
								className: "br-error",
								role: "alert",
								children: h.error
							})
						]
					})
				]
			})
		]
	});
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view st-root",
		"data-testid": "settings",
		children: [
			/* @__PURE__ */ p("style", { children: as }),
			/* @__PURE__ */ m("header", {
				className: "st-top",
				children: [/* @__PURE__ */ p(V, {
					role: "settings",
					size: 26,
					className: "st-top-icon"
				}), /* @__PURE__ */ m("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ p("h2", { children: "设置" }), /* @__PURE__ */ p("p", { children: "这台机器上的 app：brain-kit、你是谁、仓库、KiroCrew、团队运行机" })]
				})]
			}),
			e && /* @__PURE__ */ p(ts, {
				status: e,
				onTeam: () => i({ kind: "team" })
			}),
			/* @__PURE__ */ m("div", {
				className: "st-main",
				children: [/* @__PURE__ */ m("div", {
					className: "st-col",
					children: [e && /* @__PURE__ */ p(ns, {
						repos: e.repos,
						onImport: y,
						onRemoved: t,
						onChanged: n
					}), b]
				}), /* @__PURE__ */ p("div", {
					className: "st-col",
					children: e && /* @__PURE__ */ p(is, {
						crew: e.crew,
						onFixed: n
					})
				})]
			})
		]
	});
}
var es = (e) => e ? "有" : "没有";
function ts({ status: e, onTeam: t }) {
	let n = e.team.enabled ? e.team.ok ? {
		label: "正常",
		tone: "ok"
	} : {
		label: "有问题",
		tone: "bad"
	} : {
		label: "没开",
		tone: "idle"
	}, r = [...new Set(e.repos.map((e) => e.me?.name).filter((e) => !!e))].join("、") || e.me.user || (e.repos.some((e) => e.me?.source === "token") ? "GitLab 账号" : ""), i = e.repos.filter((e) => e.me?.ask).length;
	return /* @__PURE__ */ m("div", {
		className: "br-kpis st-stats",
		children: [
			/* @__PURE__ */ m("section", {
				className: `br-kpi st-stat ${e.brainkit.ok ? "is-good" : "is-broken"}`,
				"aria-label": "brain-kit",
				children: [
					/* @__PURE__ */ m("div", {
						className: "st-stat-head",
						children: [
							/* @__PURE__ */ p(V, {
								role: "brain",
								size: 18
							}),
							/* @__PURE__ */ p("span", {
								className: "br-kpi-label",
								children: "brain-kit"
							}),
							/* @__PURE__ */ p("span", { className: "br-grow" }),
							/* @__PURE__ */ p("span", {
								className: `br-chip tone-${e.brainkit.ok ? "ok" : "bad"}`,
								children: e.brainkit.ok ? "找到了" : "找不到"
							})
						]
					}),
					/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
						className: "br-kpi-big",
						children: e.brainkit.version ?? "—"
					}), /* @__PURE__ */ p("span", {
						className: "br-kpi-of",
						children: "版本"
					})] }),
					/* @__PURE__ */ p("code", {
						className: "st-path",
						title: e.brainkit.path,
						children: e.brainkit.path || "—"
					}),
					/* @__PURE__ */ p("div", {
						className: "st-mods",
						"aria-label": "模块",
						children: Object.entries(e.brainkit.modules).map(([e, t]) => /* @__PURE__ */ m("span", {
							className: `br-chip tone-${t ? "ok" : "idle"}${t ? "" : " is-off"}`,
							children: [
								/* @__PURE__ */ p("i", {
									"aria-hidden": "true",
									children: t ? "✓" : "–"
								}),
								e,
								" ",
								es(t)
							]
						}, e))
					}),
					e.brainkit.error && /* @__PURE__ */ p("p", {
						className: "br-error br-small",
						children: e.brainkit.error
					})
				]
			}),
			/* @__PURE__ */ m("section", {
				className: `br-kpi st-stat ${r && !i ? "is-good" : "is-warn"}`,
				"aria-label": "我是谁",
				children: [
					/* @__PURE__ */ m("div", {
						className: "st-stat-head",
						children: [/* @__PURE__ */ p(V, {
							role: "person",
							size: 18
						}), /* @__PURE__ */ p("span", {
							className: "br-kpi-label",
							children: "我是谁"
						})]
					}),
					/* @__PURE__ */ p("div", { children: /* @__PURE__ */ p("span", {
						className: "br-kpi-big st-user",
						children: r || "没设置"
					}) }),
					i > 0 && /* @__PURE__ */ m("p", {
						className: "br-warn-text br-small",
						children: [i, " 个仓库里 brain-kit 还不知道你是谁：在下面「仓库」里填上"]
					}),
					!r && !e.repos.some((e) => e.me) && /* @__PURE__ */ m("p", {
						className: "br-warn-text br-small",
						children: ["在终端里：", /* @__PURE__ */ p("code", { children: "git config --global brain.user 你的用户名" })]
					}),
					/* @__PURE__ */ p("div", {
						className: "st-mods",
						children: /* @__PURE__ */ m("span", {
							className: `br-chip tone-${e.me.token ? "ok" : "warn"}`,
							children: [
								/* @__PURE__ */ p("i", {
									"aria-hidden": "true",
									children: e.me.token ? "✓" : "!"
								}),
								"GitLab token ",
								es(e.me.token)
							]
						})
					}),
					e.me.how && /* @__PURE__ */ p("div", {
						className: "br-kpi-note st-how",
						children: e.me.how
					})
				]
			}),
			/* @__PURE__ */ m("section", {
				className: `br-kpi st-stat${e.team.enabled ? e.team.ok ? " is-good" : " is-broken" : ""}`,
				"aria-label": "团队运行机",
				children: [
					/* @__PURE__ */ m("div", {
						className: "st-stat-head",
						children: [
							/* @__PURE__ */ p(V, {
								role: "runner",
								size: 18
							}),
							/* @__PURE__ */ p("span", {
								className: "br-kpi-label",
								children: "团队运行机"
							}),
							/* @__PURE__ */ p("span", { className: "br-grow" }),
							/* @__PURE__ */ p("span", {
								className: `br-chip tone-${n.tone}`,
								children: n.label
							})
						]
					}),
					e.team.enabled ? /* @__PURE__ */ m(f, { children: [
						/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
							className: "br-kpi-big st-user",
							children: e.team.last_loop_at ? j(e.team.last_loop_at) : "还没跑过"
						}), /* @__PURE__ */ p("span", {
							className: "br-kpi-of",
							children: "上一轮"
						})] }),
						/* @__PURE__ */ m("div", {
							className: "st-mods",
							children: [
								/* @__PURE__ */ m("span", {
									className: `br-chip tone-${e.team.signer.pending ? "wait" : "idle"}`,
									children: ["等签名 ", e.team.signer.pending]
								}),
								/* @__PURE__ */ m("span", {
									className: `br-chip tone-${e.team.signer.refused ? "bad" : "idle"}`,
									children: ["拒签 ", e.team.signer.refused]
								}),
								/* @__PURE__ */ p("button", {
									type: "button",
									className: "br-btn is-small",
									onClick: t,
									children: "看运行机"
								})
							]
						}),
						e.team.loop_error && /* @__PURE__ */ m("p", {
							className: "br-bad-text br-pre br-small",
							children: [/* @__PURE__ */ p("b", { children: "上一轮出错：" }), e.team.loop_error]
						})
					] }) : /* @__PURE__ */ p("div", {
						className: "br-kpi-note st-how",
						children: "这台机器只在本机开发。要当团队运行机，在下面的设置里打开团队模式。"
					}),
					e.team.same_user && /* @__PURE__ */ p("p", {
						className: "br-warn-text br-small",
						role: "alert",
						children: "签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用"
					}),
					e.team.error && /* @__PURE__ */ p("p", {
						className: "br-error br-small",
						children: e.team.error
					})
				]
			})
		]
	});
}
function ns({ repos: e, onImport: t, onRemoved: n, onChanged: r }) {
	let i = e.filter((e) => e.ok).length;
	return /* @__PURE__ */ m("section", {
		className: "br-card",
		"aria-label": "仓库",
		children: [/* @__PURE__ */ m("header", { children: [
			/* @__PURE__ */ p(V, {
				role: "list",
				size: 18
			}),
			/* @__PURE__ */ p("h3", { children: "仓库" }),
			/* @__PURE__ */ m("span", {
				className: "br-dim br-small",
				children: [
					e.length,
					" 个",
					e.length ? ` · 能用 ${i}` : ""
				]
			}),
			/* @__PURE__ */ p("span", { className: "br-grow" }),
			/* @__PURE__ */ m("button", {
				type: "button",
				className: "br-btn is-small is-primary",
				onClick: () => t(),
				children: [/* @__PURE__ */ p(V, {
					role: "import",
					size: 14
				}), "导入仓库"]
			})
		] }), e.length === 0 ? /* @__PURE__ */ m("div", {
			className: "st-norepo",
			children: [/* @__PURE__ */ p("p", {
				className: "br-note",
				children: "还没有仓库：点「导入仓库」。"
			}), /* @__PURE__ */ p(He, {
				steps: Ie,
				label: "导入仓库的步骤"
			})]
		}) : /* @__PURE__ */ p("ul", {
			className: "st-repos",
			children: e.map((e) => /* @__PURE__ */ p(rs, {
				r: e,
				onImport: t,
				onRemoved: n,
				onChanged: r
			}, e.path))
		})]
	});
}
function rs({ r: e, onImport: t, onRemoved: n, onChanged: r }) {
	let i = c(), [a, s] = o(!1), l = O(() => i.post(w.repoRemove(), { path: e.path })), u = async () => {
		let e = await l.run();
		e && n(e.status);
	}, d = e.ok ? "ok" : e.pending ? "wait" : "bad";
	return /* @__PURE__ */ m("li", {
		className: `st-repo is-${d}`,
		"data-repo": e.id,
		children: [
			/* @__PURE__ */ m("div", {
				className: "st-repo-top",
				children: [
					/* @__PURE__ */ p("span", {
						className: "st-repo-icon",
						children: /* @__PURE__ */ p(V, {
							role: "file",
							size: 18
						})
					}),
					/* @__PURE__ */ p("b", {
						className: "st-repo-name",
						children: e.name
					}),
					/* @__PURE__ */ p("span", {
						className: `br-chip tone-${d}`,
						children: e.ok ? "能用" : e.pending ? e.pending.word || "在分支上" : "读不到"
					}),
					/* @__PURE__ */ p("code", {
						className: "st-path",
						title: e.path,
						children: e.path
					}),
					/* @__PURE__ */ p("span", { className: "br-grow" }),
					!a && /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => s(!0),
						children: "移出列表"
					})
				]
			}),
			e.kit && /* @__PURE__ */ m("div", {
				className: "st-kit",
				children: [
					/* @__PURE__ */ m("span", {
						className: "br-tag",
						children: ["需求号 ", /* @__PURE__ */ m("b", { children: [e.kit.req_prefix, "-n"] })]
					}),
					/* @__PURE__ */ m("span", {
						className: "br-tag",
						children: ["跟踪 ", /* @__PURE__ */ p("b", { children: e.kit.tracker })]
					}),
					/* @__PURE__ */ m("span", {
						className: "br-tag",
						children: ["默认分支 ", /* @__PURE__ */ p("b", { children: e.kit.default_branch })]
					}),
					/* @__PURE__ */ m("span", {
						className: "br-tag",
						title: e.kit.gitlab_base,
						children: ["GitLab ", /* @__PURE__ */ p("b", { children: e.kit.gitlab_project })]
					})
				]
			}),
			e.error && /* @__PURE__ */ m("div", {
				className: "st-repo-why",
				children: [/* @__PURE__ */ p("span", {
					className: "br-bad-text",
					children: e.error
				}), /* @__PURE__ */ p("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => t(e.path),
					children: "去检查"
				})]
			}),
			e.pending && /* @__PURE__ */ p(Re, {
				repo: e,
				onOpen: () => t(e.path),
				onDone: r
			}),
			e.me && /* @__PURE__ */ m("div", {
				className: "st-me",
				children: [/* @__PURE__ */ p("span", {
					className: "br-dim br-small",
					children: "你是谁"
				}), /* @__PURE__ */ p(Ve, {
					path: e.path,
					me: e.me,
					onSaved: (e) => n(e.status)
				})]
			}),
			a && /* @__PURE__ */ m("div", {
				className: "br-confirm is-danger",
				role: "group",
				"aria-label": `移出 ${e.name}`,
				children: [/* @__PURE__ */ m("span", { children: [
					"只从 app 的列表里去掉 ",
					e.name,
					"：不删文件，不动分支和工作目录。以后可以再导入。"
				] }), /* @__PURE__ */ m("div", {
					className: "br-row",
					children: [/* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small is-danger",
						disabled: l.busy,
						onClick: () => void u(),
						children: l.busy ? "正在移出…" : "移出"
					}), /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: l.busy,
						onClick: () => s(!1),
						children: "取消"
					})]
				})]
			}),
			l.error && /* @__PURE__ */ p("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			})
		]
	});
}
function is({ crew: e, onFixed: t }) {
	let n = e.rows.filter((e) => e.level === "FAIL").length, r = e.rows.filter((e) => e.level === "WARN").length, i = e.rows.length - n - r;
	return /* @__PURE__ */ m("section", {
		className: `br-card${n ? " is-bad" : r ? "" : " is-ok"}`,
		"aria-label": "KiroCrew",
		children: [
			/* @__PURE__ */ m("header", { children: [
				/* @__PURE__ */ p(V, {
					role: "laptop",
					size: 18
				}),
				/* @__PURE__ */ p("h3", { children: "KiroCrew" }),
				e.checked_at && /* @__PURE__ */ m("span", {
					className: "br-dim br-small",
					children: [j(e.checked_at), "查的"]
				}),
				/* @__PURE__ */ p("span", { className: "br-grow" }),
				i > 0 && /* @__PURE__ */ m("span", {
					className: "br-chip tone-ok",
					children: [i, " 正常"]
				}),
				r > 0 && /* @__PURE__ */ m("span", {
					className: "br-chip tone-warn",
					children: [r, " 注意"]
				}),
				n > 0 && /* @__PURE__ */ m("span", {
					className: "br-chip tone-bad",
					children: [n, " 有问题"]
				})
			] }),
			e.rows.length > 0 && /* @__PURE__ */ p("div", {
				className: "kt-segs st-cells",
				role: "img",
				"aria-label": `${i} 正常，${r} 注意，${n} 有问题`,
				children: e.rows.map((e, t) => /* @__PURE__ */ p("i", {
					className: `is-${W[e.level] ?? "idle"}`,
					title: e.text
				}, t))
			}),
			/* @__PURE__ */ p(Te, {
				rows: e.rows,
				fix: e.fix,
				onFixed: t
			})
		]
	});
}
var as = "\n.st-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.st-top-icon { color: var(--accent); }\n.st-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n@media (max-width: 1100px) { .st-stats { grid-template-columns: minmax(0, 1fr); } }\n.st-stat { gap: .5em; }\n.st-stat.is-good { border-color: var(--kit-ok); }\n.st-stat.is-broken { border-color: var(--kit-bad); }\n.st-stat.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.st-stat-head { display: flex; align-items: center; gap: .5em; }\n.st-stat-head .kt-role-icon { color: var(--muted); }\n.st-stat .br-kpi-big { font-size: 2.2em; }\n.st-user { word-break: break-all; }\n.st-path { display: block; font-size: .82em; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }\n.st-mods { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }\n.st-mods .br-chip { font-size: .8em; }\n.st-mods .br-chip i { font-style: normal; }\n.st-mods .br-chip.is-off { opacity: .75; border-style: dashed; }\n.st-how { white-space: normal; }\n.st-main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--kit-gap-block, 16px); align-items: start; }\n@media (max-width: 1100px) { .st-main { grid-template-columns: minmax(0, 1fr); } }\n.st-col { display: grid; gap: var(--kit-gap-block, 16px); min-width: 0; align-content: start; }\n.st-repos { list-style: none; margin: 0; padding: 0; display: grid; gap: .6em; }\n.st-repo { display: grid; gap: .5em; padding: .75em .9em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card));\n  box-shadow: inset 3px 0 0 var(--st-c, transparent); }\n.st-repo.is-ok { --st-c: var(--kt-ok); }\n.st-repo.is-wait { --st-c: var(--kt-approve); border-color: var(--kit-wait); }\n.st-repo.is-bad { --st-c: var(--kt-bad); border-color: var(--kit-bad); }\n.st-repo-top { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; min-width: 0; }\n.st-repo-icon { display: inline-grid; place-items: center; color: var(--st-c, var(--muted)); }\n.st-repo-name { color: var(--text-strong); font-size: 1.05em; }\n.st-repo-top .st-path { flex: 0 1 auto; max-width: 28em; }\n.st-kit { display: flex; flex-wrap: wrap; gap: .35em; }\n.st-kit .br-tag { color: var(--muted); }\n.st-kit .br-tag b { color: var(--text-strong); font-weight: 650; margin-left: .3em; }\n.st-repo-why { display: flex; align-items: center; gap: .5em .8em; flex-wrap: wrap; font-size: .93em; }\n.st-me { display: flex; align-items: flex-start; gap: .4em .8em; flex-wrap: wrap; font-size: .93em; }\n.st-me > .br-dim { padding-top: .2em; }\n.st-norepo { display: grid; gap: .8em; }\n.st-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(18em, 1fr)); gap: .8em 1.2em; align-items: start; }\n.st-team { gap: .8em; }\n.st-team.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }\n.st-toggle { display: grid; gap: .1em; }\n.st-toggle b { color: var(--text-strong); }\n.st-toggle .br-hint { padding-left: 1.6em; }\n.st-cells i.is-ok { background: var(--kt-ok); } .st-cells i.is-warn { background: var(--kt-warn); } .st-cells i.is-bad { background: var(--kt-bad); }\n", os = [
	{
		kind: "lean_approval",
		heading: "Lean 审批",
		icon: "req",
		tone: "wait",
		hint: "在会话里自己打一行批准"
	},
	{
		kind: "question",
		heading: "运行机上的问题",
		icon: "question",
		tone: "wait",
		hint: "在 MR 上回答"
	},
	{
		kind: "clarify",
		heading: "本地澄清",
		icon: "question",
		tone: "wait",
		hint: "在这里回答"
	},
	{
		kind: "acceptance",
		heading: "等验收",
		icon: "release",
		tone: "wait",
		hint: "在 MR 上验收"
	},
	{
		kind: "handoff_rejected",
		heading: "接手被拒",
		icon: "handover",
		tone: "bad",
		hint: "改好再交接"
	},
	{
		kind: "handoff_unlabelled",
		heading: "没交出去的交接",
		icon: "handover",
		tone: "warn",
		hint: "MR 上没有交接标签"
	},
	{
		kind: "crew",
		heading: "KiroCrew 的问题",
		icon: "settings",
		tone: "bad",
		hint: "修好了才能开工"
	}
], ss = {
	wait: "等你",
	bad: "被拒或坏了",
	warn: "看一眼"
}, cs = (e) => e && /DESIGN|PLAN|INCEPTION/i.test(e) ? "design" : "req", ls = [
	{
		icon: "req",
		title: "Lean 审批",
		text: "在会话里自己打一行"
	},
	{
		icon: "question",
		title: "澄清",
		text: "本地会话问你，在这里答"
	},
	{
		icon: "handover",
		title: "交接",
		text: "被拒或没交出去"
	},
	{
		icon: "question",
		title: "运行机的问题",
		text: "在 MR 上回答"
	},
	{
		icon: "release",
		title: "验收",
		text: "在 MR 上验收"
	}
];
function us(e) {
	let t = D(w.todo(), e.pollMs ?? 1e4), n = t.data, r = () => {
		t.reload(), e.reloadStatus();
	}, i = Date.now() / 1e3, s = a(null), [c, l] = o(!1), u = n ? os.map((e) => ({
		...e,
		items: n.items.filter((t) => t.kind === e.kind)
	})).filter((e) => e.items.length > 0 || e.kind === "crew" && c) : [], d = (e) => s.current?.querySelector(`[data-testid="todo-${e}"]`)?.scrollIntoView?.({
		block: "start",
		behavior: "smooth"
	});
	return /* @__PURE__ */ m("main", {
		className: "kt-root br-view td-root",
		"data-testid": "br-todo",
		ref: s,
		children: [
			/* @__PURE__ */ p("style", { children: fs }),
			/* @__PURE__ */ m("header", {
				className: "td-top",
				children: [/* @__PURE__ */ p(V, {
					role: "todo",
					size: 26,
					className: "td-top-icon"
				}), /* @__PURE__ */ m("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ p("h2", { children: "待办" }), /* @__PURE__ */ p("p", { children: "等你做的事：做完一件，这里就少一件" })]
				})]
			}),
			n?.team && /* @__PURE__ */ p("p", {
				className: "br-banner",
				"data-testid": "todo-team",
				children: "运行机的面板不收回答：回答在 GitLab 上，那里认得出是谁。"
			}),
			/* @__PURE__ */ p(Y, {
				loading: t.loading,
				error: t.error,
				has: !!n
			}),
			n && n.items.length === 0 && !c && /* @__PURE__ */ p(Ue, {
				testid: "todo-empty",
				title: "现在没有等你做的事",
				text: ["需求走到要你动手的地方，就会出现在这里，按种类分好：Lean 的审批、会话问你的澄清、交接被拒、运行机上的问题、验收，还有 KiroCrew 这边要修的。"],
				punch: "这一页空着，就是没有谁在等你。",
				flow: ls,
				children: /* @__PURE__ */ m("button", {
					type: "button",
					className: "br-btn",
					onClick: () => e.go({ kind: "overview" }),
					children: [/* @__PURE__ */ p(V, {
						role: "list",
						size: 16
					}), "看交付总览"]
				})
			}),
			n && n.items.length > 0 && /* @__PURE__ */ m("div", {
				className: "br-kpi td-kpi",
				"data-testid": "todo-count",
				children: [
					/* @__PURE__ */ p("div", {
						className: "br-kpi-label",
						children: "等你做的事"
					}),
					/* @__PURE__ */ m("div", {
						className: "td-kpi-row",
						children: [/* @__PURE__ */ m("div", { children: [/* @__PURE__ */ p("span", {
							className: "br-kpi-big",
							children: n.items.length
						}), /* @__PURE__ */ p("span", {
							className: "br-kpi-of",
							children: "件"
						})] }), /* @__PURE__ */ p("div", {
							className: "td-cells",
							role: "img",
							"aria-label": u.map((e) => `${e.heading} ${e.items.length}`).join("，"),
							children: u.flatMap((e) => e.items.map((t, n) => /* @__PURE__ */ p("i", {
								className: `is-${e.tone}`,
								title: `${e.heading}：${t.key || t.title}`
							}, `${e.kind}-${n}`)))
						})]
					}),
					/* @__PURE__ */ p("nav", {
						className: "td-jumps",
						"aria-label": "待办的种类",
						children: u.map((e) => /* @__PURE__ */ m("button", {
							type: "button",
							className: `td-jump is-${e.tone}`,
							onClick: () => d(e.kind),
							title: e.hint,
							children: [
								/* @__PURE__ */ p(V, {
									role: e.icon,
									size: 15
								}),
								e.heading,
								" ",
								/* @__PURE__ */ p("b", { children: e.items.length })
							]
						}, e.kind))
					})
				]
			}),
			u.length > 0 && /* @__PURE__ */ p("div", {
				className: "td-groups",
				children: u.map((t) => /* @__PURE__ */ m("section", {
					className: `td-group is-${t.tone}`,
					"aria-label": t.heading,
					"data-testid": `todo-${t.kind}`,
					children: [/* @__PURE__ */ m("header", {
						className: "td-group-head",
						children: [
							/* @__PURE__ */ p("span", {
								className: "td-group-icon",
								children: /* @__PURE__ */ p(V, {
									role: t.icon,
									size: 20
								})
							}),
							/* @__PURE__ */ p("h3", { children: t.heading }),
							/* @__PURE__ */ p("span", {
								className: `kt-badge td-badge is-${t.tone}`,
								children: t.items.length
							}),
							/* @__PURE__ */ p("span", {
								className: "br-dim br-small",
								children: t.hint
							})
						]
					}), t.kind === "crew" && e.status ? /* @__PURE__ */ p("article", {
						className: "td-item is-bad td-crew",
						"data-kind": "crew",
						children: /* @__PURE__ */ p(Te, {
							rows: e.status.crew.rows,
							only: ["FAIL", "WARN"],
							fix: e.status.crew.fix,
							onFixed: r,
							onHold: l
						})
					}) : /* @__PURE__ */ p("div", {
						className: "td-items",
						children: t.items.map((n, a) => /* @__PURE__ */ p(ds, {
							it: n,
							group: t,
							now: i,
							...e,
							onAnswered: r
						}, `${n.key}-${a}`))
					})]
				}, t.kind))
			})
		]
	});
}
function ds({ it: e, group: t, now: n, go: r, onAnswered: i }) {
	let a = u(), o = e.kind === "lean_approval" ? cs(e.approval) : t.icon, s = e.kind === "acceptance" ? "去 MR 上验收" : e.kind === "question" ? "去 MR 上回答" : "看 MR";
	return /* @__PURE__ */ m("article", {
		className: `td-item is-${t.tone}`,
		"data-testid": "todo-item",
		"data-kind": e.kind,
		"aria-label": `${t.heading} ${e.key || e.title}`,
		children: [
			/* @__PURE__ */ m("div", {
				className: "td-item-top",
				children: [
					/* @__PURE__ */ p("span", {
						className: "td-item-icon",
						title: ss[t.tone],
						children: /* @__PURE__ */ p(V, {
							role: o,
							size: 18
						})
					}),
					e.key ? /* @__PURE__ */ p("button", {
						type: "button",
						className: "br-link br-key",
						title: "看需求详情",
						onClick: () => r({
							kind: "item",
							repo: e.repo,
							key: e.key,
							from: "todo"
						}),
						children: e.key
					}) : null,
					/* @__PURE__ */ p("b", {
						className: "td-title",
						children: e.title
					}),
					/* @__PURE__ */ p("span", { className: "br-grow" }),
					e.approval && /* @__PURE__ */ p("span", {
						className: "br-chip tone-wait",
						children: e.approval
					}),
					e.since !== null && /* @__PURE__ */ p("span", {
						className: "br-dim br-small",
						children: j(e.since, n)
					})
				]
			}),
			/* @__PURE__ */ p("p", {
				className: "td-text",
				children: e.text
			}),
			e.kind === "lean_approval" && e.line && /* @__PURE__ */ p(q, {
				line: e.line,
				sessionUrl: e.session?.url ?? null
			}),
			e.question && (e.kind === "question" || e.kind === "clarify" || e.kind === "acceptance") && /* @__PURE__ */ p(lt, {
				q: e.question,
				repo: e.repo,
				reqKey: e.key,
				mrUrl: e.mr_url ?? e.question.mr_url,
				onAnswered: i
			}),
			(e.key || e.session && e.kind !== "lean_approval" || !e.question && e.mr_url) && /* @__PURE__ */ m("div", {
				className: "td-acts",
				children: [
					!e.question && e.mr_url && /* @__PURE__ */ p(K, {
						href: e.mr_url,
						className: `br-btn is-small${t.tone === "wait" ? " is-primary" : ""}`,
						children: s
					}),
					e.session && e.kind !== "lean_approval" && /* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => a(e.session.url),
						children: [/* @__PURE__ */ p(H, {
							name: "MessageSquare",
							size: 13
						}), "打开会话"]
					}),
					/* @__PURE__ */ p("span", { className: "br-grow" }),
					e.key && /* @__PURE__ */ m("button", {
						type: "button",
						className: "br-btn is-small",
						title: "在需求看板上看它走到哪了",
						onClick: () => r({
							kind: "board",
							repo: e.repo,
							key: e.key,
							from: "todo"
						}),
						children: [/* @__PURE__ */ p(V, {
							role: "runner",
							size: 14
						}), "看板"]
					})
				]
			})
		]
	});
}
var fs = "\n.td-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.td-top-icon { color: var(--accent); }\n.td-root { --td-wait: var(--kt-approve); --td-bad: var(--kt-bad); --td-warn: var(--kt-warn); }\n.td-root .is-wait { --td-c: var(--td-wait); --td-b: var(--kit-wait); }\n.td-root .is-bad { --td-c: var(--td-bad); --td-b: var(--kit-bad); }\n.td-root .is-warn { --td-c: var(--td-warn); --td-b: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.td-kpi { gap: .6em; border-color: var(--kit-wait); }\n.td-kpi-row { display: flex; align-items: center; gap: .8em 1.6em; flex-wrap: wrap; }\n.td-cells { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 18em; }\n.td-cells i { width: 1.9em; height: 1.9em; border-radius: .5em; border: 2px solid var(--td-c); background: color-mix(in srgb, var(--td-c) 22%, transparent); }\n.td-cells i.is-wait { animation: kt-blink 2.4s ease-in-out infinite; }\n@media (prefers-reduced-motion: reduce) { .td-cells i.is-wait { animation: none; } }\n.td-jumps { display: flex; flex-wrap: wrap; gap: .4em; }\n.td-jump { appearance: none; font: inherit; font-size: .88em; display: inline-flex; align-items: center; gap: .4em; padding: .25em .8em; border-radius: 999px; cursor: pointer;\n  color: var(--text); background: color-mix(in srgb, var(--td-c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--td-c) 45%, transparent); }\n.td-jump .kt-role-icon { color: var(--td-c); }\n.td-jump b { color: var(--text-strong); }\n.td-jump:hover { border-color: var(--td-c); }\n.td-groups { columns: 3 30em; column-gap: var(--kit-gap-block, 16px); }\n.td-group { display: grid; gap: .7em; break-inside: avoid; margin-bottom: 1.4em; }\n.td-group-head { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; }\n.td-group-head h3 { font-size: 1.1em; }\n.td-group-icon { display: grid; place-items: center; width: 2.1em; height: 2.1em; border-radius: .6em; color: var(--td-c);\n  border: 1px solid color-mix(in srgb, var(--td-c) 50%, var(--border)); background: color-mix(in srgb, var(--td-c) 12%, transparent); }\n.td-root span.td-badge { --kt-tone: var(--td-c); font-size: .8em; }\n.td-items { display: grid; gap: var(--kit-gap-row, 12px); }\n.td-item { display: grid; gap: .6em; align-content: start; padding: .9em 1.1em; border-radius: var(--kit-r, 16px); background: var(--card);\n  border: 1px solid var(--td-b, var(--border)); box-shadow: inset 3px 0 0 var(--td-c, transparent); }\n.td-item-top { display: flex; align-items: center; gap: .4em .6em; flex-wrap: wrap; }\n.td-item-icon { display: inline-grid; place-items: center; color: var(--td-c); }\n.td-title { color: var(--text-strong); font-weight: 700; }\n.td-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text); }\n.td-acts { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }\n.td-acts a.br-btn { text-decoration: none; }\n.td-acts a.br-btn.is-primary { color: var(--accent-fg, #fff); }\n", ps = 3e4;
function ms({ pollMs: e } = {}) {
	let [n, i] = o(() => ({
		...it(window.location.search),
		n: 0
	})), [s, d] = o(() => ys(it(window.location.search), gs())), f = c(), [h, g] = o(!1), _ = u(), v = l(), y = a(null), b = a(it(window.location.search)), x = a(b.current.kind === "overview" ? b.current : { kind: "overview" }), S = D(w.status(), e ?? 3e4), C = S.data?.counts.todo ?? 0;
	r(() => {
		S.data && v(C);
	}, [C, !!S.data]);
	let T = t((e) => {
		b.current = e, e.kind === "overview" && (x.current = e), d((t) => {
			let n = ys(e, t);
			return n !== t && _s(n), n;
		});
	}, []), E = (e) => `${window.location.pathname}${at(e)}`, O = () => Number(window.history.state?.brDepth ?? 0), k = t((e) => {
		T(e);
		try {
			window.history.replaceState({
				...window.history.state ?? {},
				brDepth: O()
			}, "", E(e));
		} catch {}
	}, [T]), A = t((e) => {
		let t = O() + 1, n = E(e);
		T(e), i((t) => ({
			...e,
			n: t.n + 1
		})), _(n);
		let r = () => {
			let e = window.history.state;
			`${window.location.pathname}${window.location.search}` === n && e?.brDepth === void 0 && window.history.replaceState({
				...e ?? {},
				brDepth: t
			}, "", n);
		};
		r(), setTimeout(r, 0), setTimeout(r, 60);
	}, [T, _]);
	r(() => {
		let e = () => {
			let e = it(window.location.search);
			T(e), i((t) => ({
				...e,
				n: t.n + 1
			}));
		};
		return window.addEventListener("popstate", e), () => window.removeEventListener("popstate", e);
	}, [T]), r(() => {
		n.n && y.current?.scrollIntoView?.({ block: "start" });
	}, [n.n]);
	let j = t((e) => O() > 0 ? window.history.back() : A(e), [A]), M = t((e) => {
		if (e === "overview") return A(x.current);
		if (e === "item" || e === "board") {
			if (s) return A({
				kind: e,
				...s
			});
			g(!0), f.get(w.overview("all")).then((t) => {
				let n = vs(t.rows);
				A(n ? {
					kind: e,
					repo: n.repo,
					key: n.key
				} : x.current);
			}, () => A(x.current)).finally(() => g(!1));
			return;
		}
		let t = bs(b.current);
		if (e === "new") return A({
			kind: "new",
			...t ? { repo: t } : {}
		});
		if (e === "brain") return A({
			kind: "brain",
			...t ? { repo: t } : {}
		});
		A({ kind: e });
	}, [
		A,
		s,
		f
	]), N = t((e) => {
		let t = b.current.kind;
		if (e.kind === "item" && !e.from && (t === "overview" || t === "todo" || t === "brain" || t === "board") || e.kind === "board" && !e.from && (t === "overview" || t === "item" || t === "todo")) return A({
			...e,
			from: t
		});
		A(e);
	}, [A]), P = {
		status: S.data,
		go: N,
		replace: k,
		reloadStatus: S.reload,
		setStatus: S.set,
		pollMs: e
	}, { n: F, ...I } = n, L;
	if (I.kind === "item") {
		let { kind: e, ...t } = I, n = t.from === "todo" ? { kind: "todo" } : t.from === "brain" ? {
			kind: "brain",
			repo: t.repo
		} : t.from === "board" ? {
			kind: "board",
			repo: t.repo,
			key: t.key
		} : x.current;
		L = /* @__PURE__ */ p(ga, {
			entry: t,
			onBack: () => j(n),
			...P
		}, F);
	} else if (I.kind === "board") {
		let { kind: e, ...t } = I, n = t.from === "todo" ? { kind: "todo" } : t.from === "item" ? {
			kind: "item",
			repo: t.repo,
			key: t.key
		} : x.current;
		L = /* @__PURE__ */ p(si, {
			entry: t,
			onBack: t.from ? () => j(n) : void 0,
			...P
		}, F);
	} else if (I.kind === "new") {
		let { kind: e, ...t } = I;
		L = /* @__PURE__ */ p(uo, {
			entry: t,
			...P
		}, F);
	} else if (I.kind === "brain") {
		let { kind: e, ...t } = I;
		L = /* @__PURE__ */ p(ji, {
			entry: t,
			...P
		}, F);
	} else if (I.kind === "todo") L = /* @__PURE__ */ p(us, { ...P }, F);
	else if (I.kind === "team") L = /* @__PURE__ */ p(Ho, { ...P }, F);
	else if (I.kind === "settings") L = /* @__PURE__ */ p($o, { ...P }, F);
	else if (I.kind === "import") {
		let { kind: e, ...t } = I;
		L = /* @__PURE__ */ p(za, {
			entry: t,
			...P
		}, F);
	} else {
		let { kind: e, ...t } = I;
		L = /* @__PURE__ */ p(Do, {
			entry: t,
			...P
		}, F);
	}
	let R = S.data, ee = R && I.kind !== "new" && I.kind !== "settings" ? R.crew.rows.filter((e) => e.level === "FAIL") : [];
	return /* @__PURE__ */ m("div", {
		ref: y,
		className: "br-app",
		"data-testid": "br-app",
		children: [
			/* @__PURE__ */ p("style", { children: li }),
			/* @__PURE__ */ p("style", { children: fi }),
			/* @__PURE__ */ p("style", { children: vi }),
			/* @__PURE__ */ p("style", { children: hi }),
			/* @__PURE__ */ p(qe, {
				view: I.kind,
				onView: M,
				item: s?.key,
				picking: h,
				todo: C,
				team: !!R?.app.team
			}),
			/* @__PURE__ */ m("div", {
				className: "br-banners",
				"data-testid": "br-banners",
				children: [
					S.error && /* @__PURE__ */ p("div", {
						className: `br-banner${R ? "" : " is-error"}`,
						role: "alert",
						children: R ? `状态刷新没成：${S.error}` : `读不到 app 的状态：${S.error}`
					}),
					R && !R.brainkit.ok && /* @__PURE__ */ p("div", {
						className: "br-banner is-error",
						role: "alert",
						"data-testid": "br-no-brainkit",
						children: /* @__PURE__ */ m("div", {
							className: "br-row",
							children: [
								/* @__PURE__ */ p("b", {
									className: "br-strong",
									children: "找不到 brain-kit"
								}),
								/* @__PURE__ */ m("span", { children: [R.brainkit.error ? `（${R.brainkit.error}）` : "", "在设置里写对它的位置。"] }),
								I.kind !== "settings" && /* @__PURE__ */ p("button", {
									type: "button",
									className: "br-btn is-small",
									onClick: () => A({ kind: "settings" }),
									children: "去设置"
								})
							]
						})
					}),
					ee.length > 0 && /* @__PURE__ */ m("div", {
						className: "br-banner is-error",
						"data-testid": "br-crew-fail",
						children: [/* @__PURE__ */ m("b", {
							className: "br-strong",
							children: [
								"KiroCrew 这边有 ",
								ee.length,
								" 件要先处理"
							]
						}), /* @__PURE__ */ p(Te, {
							rows: ee,
							fix: R?.crew.fix,
							onFixed: () => S.reload()
						})]
					})
				]
			}),
			L
		]
	});
}
var hs = "brain.app.held";
function gs() {
	try {
		let e = JSON.parse(window.localStorage.getItem(hs) || "null");
		return e && typeof e.repo == "string" && typeof e.key == "string" ? {
			repo: e.repo,
			key: e.key
		} : null;
	} catch {
		return null;
	}
}
function _s(e) {
	try {
		e && window.localStorage.setItem(hs, JSON.stringify(e));
	} catch {}
}
function vs(e) {
	if (!e.length) return null;
	let t = (e) => e.updated_at ?? 0, n = e.filter((e) => e.waits.who === "you");
	return n.length ? [...n].sort((e, n) => t(n) - t(e))[0] : [...e].sort((e, n) => t(n) - t(e))[0];
}
function ys(e, t) {
	return e.kind !== "item" && e.kind !== "board" || t && t.repo === e.repo && t.key === e.key ? t : {
		repo: e.repo,
		key: e.key
	};
}
function bs(e) {
	return "repo" in e && e.repo && e.repo !== "runner" ? e.repo : void 0;
}
//#endregion
export { ps as STATUS_POLL_MS, ms as default, vs as pickRequirement };
