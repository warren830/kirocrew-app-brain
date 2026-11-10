import { Fragment as e, createContext as t, useCallback as n, useContext as r, useEffect as i, useId as a, useMemo as o, useRef as s, useState as c, useSyncExternalStore as l } from "react";
import { useAppApi as u, useNavBadge as d, useNavigate as f } from "@kirocrew/app-sdk";
import p from "lucide-react";
import { Fragment as m, jsx as h, jsxs as g } from "react/jsx-runtime";
//#region src/types.ts
var _ = "/api/apps/brain", v = {
	claimed: "已认领",
	local: "本地开发中",
	handed_over: "已交接",
	rejected: "接手被拒",
	running: "运行机在跑",
	parked: "停下等回答",
	acceptance: "等验收",
	merged: "已合并",
	closed: "已关闭",
	unclaimed: "待认领",
	merged_into_parent: "已合进大需求"
}, y = {
	public: "公开",
	internal: "内部",
	confidential: "机密",
	secret: "绝密",
	unsure: "不确定（按机密处理）"
};
//#endregion
//#region src/hooks.ts
function b(e) {
	let t = s(e);
	return t.current = e, t;
}
var x = "(prefers-reduced-motion: reduce)";
function S() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" && !!window.matchMedia(x)?.matches;
	} catch {
		return !1;
	}
}
function C() {
	let [e, t] = c(S);
	return i(() => {
		if (typeof window.matchMedia != "function") return;
		let e = window.matchMedia(x);
		if (!e) return;
		let n = () => t(!!e.matches);
		return e.addEventListener?.("change", n), () => e.removeEventListener?.("change", n);
	}, []), e;
}
//#endregion
//#region src/api.ts
var w = 5e3, T = encodeURIComponent, E = {
	status: () => `${_}/status`,
	settings: () => `${_}/settings`,
	refresh: () => `${_}/refresh`,
	overview: (e) => `${_}/overview?repo=${T(e || "all")}`,
	requirement: (e, t) => `${_}/requirements/${T(e)}/${T(t)}`,
	board: (e, t) => `${_}/board/${T(e)}/${T(t)}`,
	session: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/session`,
	answer: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/answer`,
	split: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/split`,
	claim: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/claim`,
	childStart: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/start`,
	sync: (e, t) => `${_}/requirements/${T(e)}/${T(t)}/sync`,
	intakeNext: (e) => `${_}/intake/next?repo=${T(e)}`,
	intakeCheck: () => `${_}/intake/check`,
	intakeStart: () => `${_}/intake/start`,
	crew: () => `${_}/crew`,
	crewFix: () => `${_}/crew/fix`,
	brain: (e) => `${_}/brain?repo=${T(e)}`,
	reflectPreview: () => `${_}/brain/reflect/preview`,
	reflectApply: () => `${_}/brain/reflect/apply`,
	todo: () => `${_}/todo`,
	team: () => `${_}/team`,
	teamLoop: () => `${_}/team/loop`,
	importDefaults: () => `${_}/import/defaults`,
	importInspect: () => `${_}/import/inspect`,
	importClone: () => `${_}/import/clone`,
	importInstall: () => `${_}/import/install`,
	importJob: (e) => `${_}/import/jobs/${T(e)}`,
	importChoices: () => `${_}/import/choices`,
	importMerge: () => `${_}/import/merge`,
	importPull: () => `${_}/import/pull`,
	importPush: () => `${_}/import/push`,
	importCommit: () => `${_}/import/commit`,
	importUpgrade: () => `${_}/import/upgrade`,
	importPublish: () => `${_}/import/publish`,
	importAdd: () => `${_}/import/add`,
	repoRemove: () => `${_}/repos/remove`,
	meName: () => `${_}/me/name`
}, D = /[\u3400-\u9fff]/, O = /failed to fetch|networkerror|load failed|network request failed/i;
function k(e) {
	return e === 401 || e === 403 ? {
		text: "登录过期了",
		todo: "重新打开 KiroCrew 仪表盘，登录以后点「再试一次」"
	} : e === 0 ? {
		text: "连不上 app 的后端",
		todo: "KiroCrew 或这个 app 可能停了，网络也可能断了：等一会儿点「再试一次」"
	} : e === 404 ? {
		text: "app 的后端和页面版本对不上",
		todo: "在 KiroCrew 里重新装一次这个 app"
	} : {
		text: "app 的后端出错了",
		todo: "点「再试一次」；还不行就在 KiroCrew 里重启这个 app"
	};
}
function A(e) {
	return e instanceof Error ? e.message : String(e);
}
function j(e) {
	let t = A(e), n = /^API (\d{3}): ([\s\S]*)$/.exec(t);
	if (!n) return D.test(t) ? t : k(O.test(t) ? 0 : 500).text;
	let [, r, i] = n;
	try {
		let e = JSON.parse(i);
		if (e && typeof e.error == "string" && D.test(e.error)) return `${e.error}（${r}）`;
	} catch {
		if (D.test(i)) return `${i.trim().slice(0, 200)}（${r}）`;
	}
	return `${k(Number(r)).text}（${r}）`;
}
function M(e) {
	let t = /^API (\d{3}):/.exec(A(e));
	return t ? Number(t[1]) : 0;
}
function N(e, t = w) {
	let r = b(u()), [a, o] = c({
		data: null,
		error: "",
		status: 0,
		raw: "",
		loading: e !== null,
		path: e
	}), l = s(!1), d = s(!1), f = b(e), p = s(() => {}), m = n(async () => {
		let e = f.current;
		if (e !== null) {
			if (l.current) d.current = !0;
			else {
				l.current = !0;
				try {
					let t = await r.current.get(e);
					if (f.current !== e) return;
					o({
						data: t,
						error: "",
						status: 0,
						raw: "",
						loading: !1,
						path: e
					});
				} catch (t) {
					if (f.current !== e) return;
					o((e) => ({
						...e,
						error: j(t),
						status: M(t),
						raw: A(t),
						loading: !1
					}));
				} finally {
					l.current = !1, d.current && (d.current = !1, p.current());
				}
			}
		}
	}, [r, f]);
	i(() => {
		if (e === null) {
			o({
				data: null,
				error: "",
				status: 0,
				raw: "",
				loading: !1,
				path: e
			}), p.current = () => {};
			return;
		}
		o((t) => t.path === e ? t : {
			data: null,
			error: "",
			status: 0,
			raw: "",
			loading: !0,
			path: e
		});
		let n, r = !0, i = 0, a = (e) => {
			clearTimeout(n);
			let t = ++i;
			n = setTimeout(() => void s(t), e);
		}, s = async (e) => {
			r && e === i && (document.hidden && t > 0 || (await m(), r && e === i && t > 0 && a(t)));
		}, c = () => {
			document.hidden ? (clearTimeout(n), i++) : t > 0 && a(0);
		};
		return p.current = () => a(0), a(0), document.addEventListener("visibilitychange", c), () => {
			r = !1, clearTimeout(n), p.current = () => {}, document.removeEventListener("visibilitychange", c);
		};
	}, [
		e,
		t,
		m
	]);
	let h = n(() => p.current(), []), g = n((e) => o((t) => ({
		...t,
		data: e,
		error: "",
		status: 0,
		raw: "",
		loading: !1
	})), []), _ = a.path === e;
	return {
		data: _ ? a.data : null,
		error: _ ? a.error : "",
		status: _ ? a.status : 0,
		raw: _ ? a.raw : "",
		loading: _ ? a.loading : e !== null,
		reload: h,
		set: g
	};
}
function P(e) {
	let [t, r] = c(!1), [i, a] = c(""), [o, s] = c(null), l = b(e);
	return {
		run: n(async (...e) => {
			r(!0), a("");
			try {
				let t = await l.current(...e);
				return s(t), t;
			} catch (e) {
				return a(j(e)), null;
			} finally {
				r(!1);
			}
		}, [l]),
		busy: t,
		error: i,
		result: o,
		reset: n(() => {
			a(""), s(null);
		}, [])
	};
}
//#endregion
//#region src/nav.ts
var ee = [
	"PRODUCT",
	"TECH",
	"IMPROVEMENT",
	"PROJECT"
], F = /^(r[1-9][0-9]{0,2}|runner)$/, te = /^[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}$/, I = /^[A-Z]-(?:[A-Z][A-Z0-9]{0,9}-[1-9][0-9]{0,6}-[1-9][0-9]{0,3}|[0-9]{1,5})$/, L = /^(?:\/|~\/)[^\u0000-\u001f\u007f]{0,1023}$/, R = /^D-[0-9]{1,4}$/, z = Object.keys(v), B = [
	"overview",
	"todo",
	"brain",
	"board",
	"team"
], V = [
	"overview",
	"item",
	"todo"
], ne = [
	"accept",
	"checks",
	"lanes",
	"feed"
], re = (e) => (e ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim().slice(0, 200), H = (e) => {
	let t = e.get("repo") ?? "";
	return F.test(t) ? { repo: t } : {};
};
function ie(e) {
	let t = new URLSearchParams(e), n = t.get("view");
	if (n === "item") {
		let e = t.get("repo") ?? "", n = t.get("key") ?? "";
		if (!F.test(e) || !te.test(n)) return { kind: "overview" };
		let r = t.get("from") ?? "", i = t.get("decision") ?? "";
		return {
			kind: "item",
			repo: e,
			key: n,
			...B.includes(r) ? { from: r } : {},
			...R.test(i) ? { decision: i } : {}
		};
	}
	if (n === "board") {
		let e = t.get("repo") ?? "", n = t.get("key") ?? "";
		if (!F.test(e) || !te.test(n)) return { kind: "overview" };
		let r = {
			kind: "board",
			repo: e,
			key: n
		};
		t.get("replay") === "1" && (r.replay = !0);
		let i = t.get("focus") ?? "";
		ne.includes(i) && (r.focus = i);
		let a = t.get("from") ?? "";
		V.includes(a) && (r.from = a);
		let o = Number(t.get("at") ?? "");
		return Number.isInteger(o) && o > 1e9 && o < 1e10 && (r.at = o), r;
	}
	if (n === "new") {
		let e = {
			kind: "new",
			...H(t)
		}, n = t.get("key") ?? "";
		if (e.repo && te.test(n)) {
			e.key = n;
			let r = re(t.get("title"));
			r && (e.title = r);
		}
		return e;
	}
	if (n === "brain") {
		let e = {
			kind: "brain",
			...H(t)
		}, n = t.get("file") ?? "";
		ee.includes(n) && (e.file = n);
		let r = t.get("id") ?? "";
		I.test(r) && (e.id = r);
		let i = t.get("reflect") ?? "";
		return te.test(i) && (e.reflect = i), e;
	}
	if (n === "todo" || n === "team" || n === "settings") return { kind: n };
	if (n === "import") {
		let e = t.get("path") ?? "";
		return {
			kind: "import",
			...L.test(e) ? { path: e } : {}
		};
	}
	let r = {
		kind: "overview",
		...H(t)
	}, i = t.get("state") ?? "";
	return z.includes(i) && (r.state = i), r;
}
function ae(e) {
	let t = new URLSearchParams(), n = (e, n) => void (n ? t.set(e, n) : void 0);
	switch (e.kind) {
		case "overview":
			(e.repo || e.state) && t.set("view", "overview"), n("repo", e.repo), n("state", e.state);
			break;
		case "item":
			t.set("view", "item"), n("repo", e.repo), n("key", e.key), n("from", e.from), n("decision", e.decision && R.test(e.decision) ? e.decision : void 0);
			break;
		case "board":
			t.set("view", "board"), n("repo", e.repo), n("key", e.key), e.replay && t.set("replay", "1"), n("focus", e.focus), n("from", e.from), e.at && t.set("at", String(e.at));
			break;
		case "new":
			t.set("view", "new"), n("repo", e.repo), e.repo && e.key && te.test(e.key) && (t.set("key", e.key), n("title", re(e.title)));
			break;
		case "brain":
			t.set("view", "brain"), n("repo", e.repo), n("file", e.file), n("id", e.id), n("reflect", e.reflect);
			break;
		case "import":
			t.set("view", "import"), n("path", e.path && L.test(e.path) ? e.path : void 0);
			break;
		default: t.set("view", e.kind);
	}
	let r = t.toString();
	return r ? `?${r}` : "";
}
function U(e) {
	return {
		P: "PRODUCT",
		T: "TECH",
		I: "IMPROVEMENT",
		J: "PROJECT"
	}[e.charAt(0)];
}
var W = {
	overview: "交付总览",
	item: "需求详情",
	board: "需求看板",
	new: "开需求",
	brain: "Brain",
	todo: "待办",
	team: "运行机",
	settings: "设置",
	import: "导入仓库"
};
//#endregion
//#region src/format.ts
function G(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 60) return `${t} 秒`;
	let n = Math.round(t / 60);
	if (n < 60) return `${n} 分钟`;
	let r = Math.floor(n / 60), i = n % 60;
	return i ? `${r} 小时 ${i} 分` : `${r} 小时`;
}
function oe(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 5) return "刚刚";
	if (t < 60) return `${t} 秒前`;
	let n = Math.floor(t / 60);
	if (n < 60) return `${n} 分钟前`;
	let r = Math.floor(n / 60);
	return r < 24 ? `${r} 小时前` : `${Math.floor(r / 24)} 天前`;
}
function se(e, t = Date.now() / 1e3) {
	return e == null || !Number.isFinite(e) ? "—" : oe(t - e);
}
function ce(e) {
	return e == null || !Number.isFinite(e) ? "—" : e >= 100 ? String(Math.round(e)) : (Math.round(e * 10) / 10).toFixed(1);
}
function le([e, t]) {
	return {
		frac: `${e}/${t}`,
		pct: t > 0 ? `${Math.round(e / t * 100)}%` : "—"
	};
}
var ue = (e) => String(e).padStart(2, "0");
function K(e) {
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${t.getFullYear()}-${ue(t.getMonth() + 1)}-${ue(t.getDate())}`;
}
function de(e) {
	if (e == null || !Number.isFinite(e)) return "—";
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${K(e)} ${ue(t.getHours())}:${ue(t.getMinutes())}`;
}
function q(e) {
	if (!e) return "—";
	let t = Date.parse(e);
	return Number.isFinite(t) ? de(t / 1e3) : e;
}
function fe(e) {
	if (!e) return null;
	let t = Date.parse(e);
	return Number.isFinite(t) ? K(t / 1e3) : null;
}
function pe(e) {
	return e.split("\n").map((e) => e.trim()).filter(Boolean);
}
function me(e) {
	return e.split(/[\s,，、;；]+/).filter(Boolean);
}
function he(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 60) return "不到 1 分钟";
	let n = Math.floor(t / 60);
	if (n < 60) return `${n} 分钟`;
	let r = Math.floor(n / 60);
	return r < 48 ? `${r} 小时` : `${Math.floor(r / 24)} 天`;
}
var ge = /[㐀-鿿]/, _e = /[A-Za-z0-9]/;
function ve(...e) {
	return e.reduce((e, t) => {
		let n = e.slice(-1), r = t.slice(0, 1);
		return e + (ge.test(n) && _e.test(r) || _e.test(n) && ge.test(r) ? " " : "") + t;
	}, "");
}
//#endregion
//#region src/jobs.ts
var J = 1e3;
function ye(e = J, t) {
	let r = b(u()), a = b(t), [o, s] = c(null), [l, d] = c(""), [f, p] = c(0);
	return i(() => {
		if (!o || o.state !== "running") return;
		let t = !0, n = setTimeout(async () => {
			try {
				let e = await r.current.get(E.importJob(o.id));
				if (!t) return;
				d(""), s(e), e.state !== "running" && a.current?.(e);
			} catch (e) {
				if (!t) return;
				d(`读不到进度：${j(e)}（还会再读）`), p((e) => e + 1);
			}
		}, e);
		return () => {
			t = !1, clearTimeout(n);
		};
	}, [
		o,
		f,
		e,
		r,
		a
	]), {
		job: o,
		start: n((e) => {
			s(e), d(""), e && e.state !== "running" && a.current?.(e);
		}, [a]),
		readError: l
	};
}
//#endregion
//#region src/board/RoleIcon.tsx
var be = {
	intent: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("circle", {
			cx: "12",
			cy: "12",
			r: "8.5"
		}),
		/* @__PURE__ */ h("circle", {
			cx: "12",
			cy: "12",
			r: "4.5"
		}),
		/* @__PURE__ */ h("path", { d: "M12 12h.01" })
	] }),
	feasibility: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M12 4v15.5M8 19.5h8M5 7.5h14" }), /* @__PURE__ */ h("path", { d: "M5 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L5 7.5zM19 7.5l-2.5 6a2.8 2.8 0 0 0 5 0L19 7.5z" })] }),
	scope: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M10 6.5h10M10 12h10M10 17.5h10" }), /* @__PURE__ */ h("path", { d: "M3.8 6.5l1.4 1.4L8 5M3.8 12l1.4 1.4L8 10.5M3.8 17.5l1.4 1.4L8 16" })] }),
	pm: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "5.5",
			y: "4.5",
			width: "13",
			height: "16",
			rx: "2"
		}),
		/* @__PURE__ */ h("path", { d: "M9.5 4.5V3.5h5v1" }),
		/* @__PURE__ */ h("path", { d: "M9 12.5l2 2 4-4" })
	] }),
	catalog: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "4",
			y: "4",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ h("rect", {
			x: "13.5",
			y: "4",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ h("rect", {
			x: "4",
			y: "13.5",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		}),
		/* @__PURE__ */ h("rect", {
			x: "13.5",
			y: "13.5",
			width: "6.5",
			height: "6.5",
			rx: "1.2"
		})
	] }),
	detail: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "4",
			y: "3.5",
			width: "16",
			height: "17",
			rx: "2"
		}),
		/* @__PURE__ */ h("rect", {
			x: "7",
			y: "6.5",
			width: "10",
			height: "6",
			rx: "1"
		}),
		/* @__PURE__ */ h("path", { d: "M7 15.5h10M7 18h6" })
	] }),
	cart: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M3 4.5h2.5l2.2 10.5h10.6l2-7.5H6.6" }),
		/* @__PURE__ */ h("circle", {
			cx: "9.5",
			cy: "19",
			r: "1.4"
		}),
		/* @__PURE__ */ h("circle", {
			cx: "17",
			cy: "19",
			r: "1.4"
		})
	] }),
	security: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M12 3.5l7.5 3v5.5c0 4.5-3.2 7.7-7.5 9-4.3-1.3-7.5-4.5-7.5-9V6.5l7.5-3z" }), /* @__PURE__ */ h("path", { d: "M9 12l2.2 2.2L15.5 10" })] }),
	architect: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" }),
		/* @__PURE__ */ h("path", { d: "M3.5 12.5l8.5 4.5 8.5-4.5" }),
		/* @__PURE__ */ h("path", { d: "M3.5 16.5l8.5 4 8.5-4" })
	] }),
	designer: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M4.5 19.5l1-4L15.5 5.5l3 3-10 10-4 1z" }), /* @__PURE__ */ h("path", { d: "M13.5 7.5l3 3" })] }),
	tester: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M9 3.5h6" }),
		/* @__PURE__ */ h("path", { d: "M10 3.5v6l-5 8.5a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3L14 9.5v-6" }),
		/* @__PURE__ */ h("path", { d: "M7.5 15.5h9" })
	] }),
	backend: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "3.5",
			y: "4.5",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ h("rect", {
			x: "3.5",
			y: "13",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ h("path", { d: "M7 7.75h.01M7 16.25h.01" })
	] }),
	frontend: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("rect", {
		x: "3.5",
		y: "4.5",
		width: "17",
		height: "11.5",
		rx: "1.5"
	}), /* @__PURE__ */ h("path", { d: "M9 20h6M12 16v4" })] }),
	mobile: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("rect", {
		x: "7",
		y: "3",
		width: "10",
		height: "18",
		rx: "2"
	}), /* @__PURE__ */ h("path", { d: "M11 18h2" })] }),
	ops: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 3.5l8 4.5v8L12 20.5 4 16V8l8-4.5z" }),
		/* @__PURE__ */ h("path", { d: "M4 8l8 4.5L20 8" }),
		/* @__PURE__ */ h("path", { d: "M12 12.5v8" })
	] }),
	deploy: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 3c3 2.2 4.5 5.5 4.5 9.5l-2 3h-5l-2-3C7.5 8.5 9 5.2 12 3z" }),
		/* @__PURE__ */ h("circle", {
			cx: "12",
			cy: "9.5",
			r: "1.6"
		}),
		/* @__PURE__ */ h("path", { d: "M9.5 15.5l-2 3.5M14.5 15.5l2 3.5M12 16v4.5" })
	] }),
	motion: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M3.5 18.5c4-1 7-4 8.5-9" }),
		/* @__PURE__ */ h("path", { d: "M17 3.5l1.1 2.4 2.4 1.1-2.4 1.1L17 10.5l-1.1-2.4-2.4-1.1 2.4-1.1z" }),
		/* @__PURE__ */ h("path", { d: "M6.5 6.5l.6 1.3 1.3.6-1.3.6-.6 1.3-.6-1.3-1.3-.6 1.3-.6z" })
	] }),
	compliance: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M12 3.5l7 3v5.5c0 4.2-2.9 7.2-7 8.5-4.1-1.3-7-4.3-7-8.5V6.5l7-3z" }), /* @__PURE__ */ h("path", { d: "M9 12l2 2 4-4" })] }),
	reviewer: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "10.5",
		cy: "10.5",
		r: "6"
	}), /* @__PURE__ */ h("path", { d: "M15 15l5 5" })] }),
	product: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("rect", {
		x: "3.5",
		y: "3.5",
		width: "17",
		height: "17",
		rx: "2"
	}), /* @__PURE__ */ h("path", { d: "M3.5 9h17M9 9v11.5" })] })
}, xe = {
	wait: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "8",
		r: "3.5"
	}), /* @__PURE__ */ h("path", { d: "M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" })] }),
	approved: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ h("path", { d: "M8.5 12.2l2.4 2.4 4.6-4.8" })] }),
	bounce: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M9 14L4 9l5-5" }), /* @__PURE__ */ h("path", { d: "M20 20v-7a4 4 0 0 0-4-4H4" })] }),
	sign: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M12 20h8" }), /* @__PURE__ */ h("path", { d: "M16.5 3.6a2.1 2.1 0 0 1 3 3L7 19.1l-4 .9.9-4L16.5 3.6z" })] }),
	merge: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("circle", {
			cx: "18",
			cy: "18",
			r: "2.5"
		}),
		/* @__PURE__ */ h("circle", {
			cx: "6",
			cy: "6",
			r: "2.5"
		}),
		/* @__PURE__ */ h("path", { d: "M6 21V8.5" }),
		/* @__PURE__ */ h("path", { d: "M6 8.5c0 5 4 9.5 9.5 9.5" })
	] }),
	book: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" }), /* @__PURE__ */ h("path", { d: "M12 6.5v13" })] }),
	issue: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "1.6"
	})] }),
	pr: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("circle", {
			cx: "18",
			cy: "18",
			r: "2.5"
		}),
		/* @__PURE__ */ h("circle", {
			cx: "6",
			cy: "6",
			r: "2.5"
		}),
		/* @__PURE__ */ h("path", { d: "M6 8.5V21" }),
		/* @__PURE__ */ h("path", { d: "M12.5 6H16a2 2 0 0 1 2 2v7.5" }),
		/* @__PURE__ */ h("path", { d: "M14.5 3.5L12 6l2.5 2.5" })
	] })
}, Se = {
	person: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "8",
		r: "3.6"
	}), /* @__PURE__ */ h("path", { d: "M4.8 20c.4-3.8 3.4-6.2 7.2-6.2s6.8 2.4 7.2 6.2" })] }),
	laptop: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "4.5",
			y: "5",
			width: "15",
			height: "10.5",
			rx: "1.6"
		}),
		/* @__PURE__ */ h("path", { d: "M2.5 19h19" }),
		/* @__PURE__ */ h("path", { d: "M8 9l2 1.6L8 12.2M11.5 12.4h3.5" })
	] }),
	req: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "5.5",
			y: "4.5",
			width: "13",
			height: "16",
			rx: "2"
		}),
		/* @__PURE__ */ h("path", { d: "M9.5 4.5V3.5h5v1" }),
		/* @__PURE__ */ h("path", { d: "M8.8 10.5h6.4M8.8 14h3.6" }),
		/* @__PURE__ */ h("path", { d: "M13.6 16.6l1.4 1.4 2.6-2.8" })
	] }),
	design: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 3.5l8.5 4.5-8.5 4.5L3.5 8 12 3.5z" }),
		/* @__PURE__ */ h("path", { d: "M3.5 12.5l8.5 4.5 8.5-4.5" }),
		/* @__PURE__ */ h("path", { d: "M3.5 16.5l8.5 4 8.5-4" })
	] }),
	handover: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M20.5 3.5L10 14" }), /* @__PURE__ */ h("path", { d: "M20.5 3.5l-6.5 17-4-6.5-6.5-4 17-6.5z" })] }),
	bridge: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M2.5 9.5h19" }),
		/* @__PURE__ */ h("path", { d: "M3.5 18.5v-9M20.5 18.5v-9" }),
		/* @__PURE__ */ h("path", { d: "M3.5 17c2.2-4.4 5-6.5 8.5-6.5s6.3 2.1 8.5 6.5" }),
		/* @__PURE__ */ h("path", { d: "M8 12.6v5.9M12 10.5v8M16 12.6v5.9" })
	] }),
	signer: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "8",
		cy: "12",
		r: "3.8"
	}), /* @__PURE__ */ h("path", { d: "M11.8 12h9M17.5 12v3M20.5 12v2.2" })] }),
	runner: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("rect", {
			x: "3.5",
			y: "4",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ h("rect", {
			x: "3.5",
			y: "13.5",
			width: "17",
			height: "6.5",
			rx: "1.5"
		}),
		/* @__PURE__ */ h("path", { d: "M7 7.25h.01M7 16.75h.01" }),
		/* @__PURE__ */ h("path", { d: "M13.5 5.8l3 1.45-3 1.45z" })
	] }),
	ci: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ h("path", { d: "M8.4 12.3l2.4 2.4 4.8-5" })] }),
	release: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M5.5 21V4" }), /* @__PURE__ */ h("path", { d: "M5.5 4.5h11l-2.2 3.8 2.2 3.8h-11" })] }),
	brain: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 6.5c-2-1.6-4.6-2-8-2v13c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2v-13c-3.4 0-6 .4-8 2z" }),
		/* @__PURE__ */ h("path", { d: "M12 6.5v13" }),
		/* @__PURE__ */ h("path", { d: "M15 9.5h2.5M15 12.5h2.5" })
	] }),
	commit: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "3.5"
	}), /* @__PURE__ */ h("path", { d: "M2.5 12h6M15.5 12h6" })] }),
	question: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M4.5 5.5h15v10h-8l-4.5 4v-4h-2.5z" }),
		/* @__PURE__ */ h("path", { d: "M10.2 8.9a1.9 1.9 0 1 1 2.6 1.8c-.6.3-.8.7-.8 1.3" }),
		/* @__PURE__ */ h("path", { d: "M12 13.6h.01" })
	] }),
	blocked: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "8.5"
	}), /* @__PURE__ */ h("path", { d: "M6 6l12 12" })] }),
	import: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2.2h7a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" }), /* @__PURE__ */ h("path", { d: "M12 11v5M9.5 13.5h5" })] }),
	settings: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("circle", {
		cx: "12",
		cy: "12",
		r: "3"
	}), /* @__PURE__ */ h("path", { d: "M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" })] }),
	todo: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M3.5 13.5l2.5-8h12l2.5 8v5a1.5 1.5 0 0 1-1.5 1.5h-14a1.5 1.5 0 0 1-1.5-1.5z" }), /* @__PURE__ */ h("path", { d: "M3.5 13.5h5l1.5 2.5h4l1.5-2.5h5" })] }),
	new: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" }),
		/* @__PURE__ */ h("path", { d: "M13.5 3.5v6h6" }),
		/* @__PURE__ */ h("path", { d: "M12 12.5v5M9.5 15h5" })
	] }),
	lint: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("circle", {
			cx: "10.5",
			cy: "10.5",
			r: "6"
		}),
		/* @__PURE__ */ h("path", { d: "M15 15l5 5" }),
		/* @__PURE__ */ h("path", { d: "M8 10.5h5" })
	] }),
	file: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M13.5 3.5h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-9z" }), /* @__PURE__ */ h("path", { d: "M13.5 3.5v6h6" })] }),
	clone: /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("path", { d: "M12 4v11" }),
		/* @__PURE__ */ h("path", { d: "M7.5 10.5L12 15l4.5-4.5" }),
		/* @__PURE__ */ h("path", { d: "M4.5 19.5h15" })
	] }),
	list: /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("path", { d: "M9 6.5h11M9 12h11M9 17.5h7" }), /* @__PURE__ */ h("path", { d: "M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" })] })
}, Ce = /* @__PURE__ */ h("circle", {
	cx: "12",
	cy: "12",
	r: "7.5"
});
function we(e) {
	return e && (be[e] || be[e.replace(/\d+$/, "")] || xe[e] || Se[e]) || Ce;
}
function Y({ role: e, size: t = 18, className: n = "" }) {
	return /* @__PURE__ */ h("svg", {
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
		children: we(e)
	});
}
function Te({ role: e, cx: t, cy: n, size: r = 22, className: i = "" }) {
	return /* @__PURE__ */ h("svg", {
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
		children: we(e)
	});
}
//#endregion
//#region src/vocab.ts
var Ee = {
	"reverse-engineering": "逆向工程",
	requirements: "需求分析",
	"user-stories": "用户故事",
	"application-design": "应用设计",
	units: "拆分单元",
	"functional-design": "功能设计",
	"nfr-design": "非功能设计",
	"infrastructure-design": "基础设施设计",
	"code-generation": "代码生成",
	"build-and-test": "构建测试",
	release: "发布"
}, De = (e) => e ? Ee[e] ?? e : "", Oe = {
	REQUIREMENTS: "需求审批",
	DESIGN: "设计审批",
	INCEPTION: "需求和设计审批",
	PLAN: "代码生成计划审批",
	RELEASE: "发布审批"
}, ke = (e) => e ? Oe[e] ?? e : "", Ae = {
	you: "你",
	agent: "AI",
	runner: "运行机",
	bridge: "桥",
	product: "产品",
	builder: "开发的人",
	people: "别人",
	nobody: "没人"
}, je = (e) => e === "nobody" ? "" : `等${Ae[e]}`, X = {
	approve: "去批准",
	reply: "去回话",
	tool: "去批准工具调用",
	start: "去开工",
	answer: "去回答",
	accept: "去验收",
	redo_handoff: "改好后重新交接",
	label_handoff: "补上交接标签",
	write_back: "回写 Brain",
	watch: "观察中",
	none: ""
}, Z = {
	openSession: "打开会话",
	copyLine: "复制那一行",
	start: "开工",
	answerOnMr: "去 MR 上回答",
	openBoard: "需求看板",
	openDetail: "需求详情",
	me: "你是谁",
	review: "开审查会话",
	writeBack: "回写 Brain",
	onBoard: "在看板上看 ↗",
	acceptOnMr: "去 MR 上验收",
	viewMr: "看 MR"
}, Q = {
	split: "拆成小需求",
	splitConfirm: "确定拆",
	claim: "认领",
	release: "放弃认领",
	start: Z.start,
	sync: "同步"
}, Me = (e) => `在 ${e} 的分支上先做`, Ne = {
	unclaimed: "待认领",
	claimed: "认领了",
	in_progress: "在做",
	merged: "已合并",
	closed: "已关闭"
}, Pe = {
	merged: "合进来了",
	up_to_date: "已经是最新的",
	conflicts: "有冲突",
	refused: "没同步"
}, Fe = {
	product: "产品需求",
	debt: "技术债",
	alert: "告警",
	schedule: "定期任务",
	"eval-gap": "Eval 发现的缺口",
	gap: "缺口",
	local: "本机"
}, Ie = (e) => e ? Fe[e] ?? e : "", Le = {
	public: "公开",
	internal: "内部",
	confidential: "机密",
	restricted: "严格受限",
	unsure: "不确定",
	secret: "绝密"
};
function Re(e) {
	if (!e.next) return e.skipped_n ? `全部做完（跳过 ${e.skipped_n}）` : "全部做完";
	let t = [`做完 ${e.done_n}`];
	e.skipped_n && t.push(`跳过 ${e.skipped_n}`);
	let n = e.stage_state === "started" && (!e.stage || e.stage === e.next.id);
	return t.push(`${n ? "在做" : "下一步"}：${e.next.label}`), t.join(" · ");
}
var ze = {
	approve: "等批准",
	reply: "等回话",
	tool: "等批准工具调用",
	start: "等开工",
	answer: "等回答",
	accept: "等验收",
	redo_handoff: "要重做交接",
	label_handoff: "要补交接标签",
	write_back: "要回写 Brain",
	watch: "观察中",
	none: ""
}, Be = "等审查", Ve = (e) => e.review ? Be : e.do ? ze[e.do] : "", He = {
	[X.redo_handoff]: 3,
	[X.label_handoff]: 2,
	[X.tool]: 3,
	[Z.review]: 1
}, Ue = {
	worktree: "在这台机器上做",
	branch: "在运行分支上（这台机器没检出）",
	main: "已合并到默认分支",
	runner: "在运行机上",
	claim: "只有认领"
}, We = {
	agent: "AI 自己定的",
	person: "人",
	check: "检查定的",
	brain: "照 Brain",
	bridge: "桥记下的",
	unclassified: "没归类",
	unknown: "看不出是谁定的"
}, Ge = {
	gate: "Lean 审批",
	verify: "自动检查",
	handover: "交接",
	brain: "Brain",
	after: "合并后观察"
}, Ke = [
	[/^bridge ledger/i, "桥的账本"],
	[/^vouchers/i, "回答凭证"],
	[/^pushes/i, "推送记录"],
	[/^CI pipelines/i, "GitLab 上的 CI"],
	[/^runnerd/i, "运行机的记录"]
], qe = (e) => Ke.find(([t]) => t.test(e))?.[1] ?? "别的记录", Je = {
	trace: "需求时间线",
	evaluate: "交付评估",
	golden: "标准考题",
	intents: "需求来源",
	mrdesc: "变更说明"
}, Ye = {
	none: "不用 Jira",
	jira: "用 Jira"
}, Xe = {
	knowledge: "缺知识",
	test: "缺测试",
	other: "其他"
};
//#endregion
//#region src/ui.tsx
function $({ name: e, size: t = 15, className: n, title: r }) {
	let i = p[e];
	return i ? /* @__PURE__ */ h(i, {
		size: t,
		className: n,
		"aria-hidden": !r || void 0,
		"aria-label": r
	}) : null;
}
var Ze = {
	claimed: "idle",
	local: "run",
	handed_over: "hand",
	rejected: "bad",
	running: "run",
	parked: "wait",
	acceptance: "wait",
	merged: "ok",
	closed: "idle",
	unclaimed: "idle",
	merged_into_parent: "ok"
}, Qe = {
	claimed: "○",
	local: "●",
	handed_over: "➜",
	rejected: "✕",
	running: "●",
	parked: "✋",
	acceptance: "✋",
	merged: "✔",
	closed: "■",
	unclaimed: "◌",
	merged_into_parent: "⤴"
}, $e = /* @__PURE__ */ new Set([
	"local",
	"running",
	"parked",
	"acceptance"
]);
function et({ state: e, label: t, who: n }) {
	let r = Ze[e] ?? "idle", i = n !== void 0 && (r === "wait" ? n !== "you" : r === "run" && n !== "agent" && n !== "runner");
	return /* @__PURE__ */ g("span", {
		className: `br-chip tone-${i && r === "wait" ? "info" : r} kt-pill${$e.has(e) && !i ? " is-live" : ""}`,
		"data-state": e,
		children: [/* @__PURE__ */ h("i", {
			"aria-hidden": "true",
			children: Qe[e] ?? "•"
		}), t || v[e] || e]
	});
}
var tt = {
	OK: "ok",
	WARN: "warn",
	FAIL: "bad"
}, nt = {
	OK: "正常",
	WARN: "注意",
	FAIL: "有问题"
}, rt = {
	OK: "✓",
	WARN: "!",
	FAIL: "✕"
}, it = {
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
}, at = {
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
}, ot = {
	waiting: {
		label: "等回答",
		tone: "wait"
	},
	open: {
		label: "已发出，等回答",
		tone: "wait"
	},
	held: {
		label: "有了回复，等 GitLab 能查了再核对",
		tone: "info"
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
}, st = (e, t) => t === "park" && e === "answered" ? {
	label: "已回答",
	tone: "info"
} : ot[e] ?? {
	label: e,
	tone: "idle"
}, ct = (e) => e.state === "waiting" || e.state === "open", lt = {
	todo: "下一步",
	done: "做完",
	skipped: "做完"
};
function ut({ lean: e, compact: t = !1 }) {
	let n = e.stage_state ? lt[e.stage_state] : void 0, r = e.stage_state === "started" && e.stage_n !== null ? e.stage_n : null;
	return /* @__PURE__ */ g("span", {
		className: "br-row",
		style: { gap: 6 },
		"data-testid": "lean-cell",
		children: [
			/* @__PURE__ */ h("span", {
				className: "br-mono",
				children: e.stage_n === null ? `0/${e.total}` : `${e.stage_n}/${e.total}`
			}),
			!t && /* @__PURE__ */ h("span", { children: e.stage_label ?? "还没开始" }),
			n && /* @__PURE__ */ h("span", {
				className: "br-hint",
				"data-testid": "lean-hint",
				children: n
			}),
			/* @__PURE__ */ h("span", {
				className: "br-prog",
				role: "img",
				"aria-label": `做完 ${e.done}/${e.total}`,
				title: `做完或跳过 ${e.done}/${e.total}`,
				children: Array.from({ length: e.total }, (t, n) => /* @__PURE__ */ h("i", { className: n < e.done ? "is-done" : r !== null && n === r - 1 ? "is-started" : "" }, n))
			})
		]
	});
}
function dt({ href: e, children: t, className: n = "br-link" }) {
	return !e || !/^https?:\/\//i.test(e) ? /* @__PURE__ */ h("span", { children: t }) : /* @__PURE__ */ g("a", {
		className: n,
		href: e,
		target: "_blank",
		rel: "noopener noreferrer",
		children: [t, /* @__PURE__ */ h($, {
			name: "ExternalLink",
			size: 12
		})]
	});
}
function ft({ mr: e }) {
	return e ? /* @__PURE__ */ g(dt, {
		href: e.url,
		children: [
			"!",
			e.iid,
			e.state ? ` · ${pt[e.state] ?? e.state}` : ""
		]
	}) : /* @__PURE__ */ h("span", {
		className: "br-dim",
		children: "—"
	});
}
var pt = {
	opened: "开着",
	merged: "已合并",
	closed: "已关闭",
	locked: "锁着"
}, mt = "在会话里自己打这一行。app 不会替你发。";
function ht({ line: e, sessionUrl: t, said: n }) {
	let r = f(), [i, a] = c(""), o = async () => {
		try {
			await navigator.clipboard.writeText(e), a("ok");
		} catch {
			a("fail");
		}
	};
	return /* @__PURE__ */ g("div", {
		className: "br-line",
		"data-testid": "type-line",
		children: [
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => void o(),
						children: [/* @__PURE__ */ h($, {
							name: "Copy",
							size: 13
						}), Z.copyLine]
					}),
					t && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => r(t),
						children: [/* @__PURE__ */ h($, {
							name: "MessageSquare",
							size: 13
						}), Z.openSession]
					}),
					i === "ok" && /* @__PURE__ */ h("span", {
						className: "br-small br-ok-text",
						role: "status",
						children: "已复制"
					}),
					i === "fail" && /* @__PURE__ */ h("span", {
						className: "br-small br-bad-text",
						role: "status",
						children: "没复制成：请手动选中这一行"
					})
				]
			}),
			!n && /* @__PURE__ */ h("p", { children: "在会话里自己打这一行。app 不会替你发。" })
		]
	});
}
var gt = {
	agent: "补上 Lean 的拦截",
	engine: "把引擎换成 kas"
}, _t = "重装 kit 文件", vt = [
	...Object.values(gt),
	_t,
	"装上 brain-dev"
], yt = (e, t) => {
	let n = /点「([^」]{2,20})」/.exec(e.todo ?? "")?.[1] ?? "";
	return vt.includes(n) ? n : t;
};
function bt(e, t) {
	return e.fix === void 0 ? e.level === "OK" ? null : t?.agent && /brain-dev/.test(e.text) ? "agent" : t?.engine && /引擎/.test(e.text) ? "engine" : null : e.fix;
}
function xt({ rows: e, fix: t, only: n, onFixed: r, onHold: a, empty: o }) {
	let s = u(), l = P((e) => s.post(E.crewFix(), e)), [d, f] = c({}), p = b(a), m = Object.keys(d).length > 0;
	i(() => {
		p.current?.(m);
	}, [m, p]), i(() => () => p.current?.(!1), [p]);
	let _ = (e, t) => f((n) => {
		let r = { ...n };
		return t ? r[e.repo] = e : delete r[e.repo], r;
	}), v = n ? e.filter((e) => n.includes(e.level)) : e, y = new Set(v.filter((e) => e.repo && bt(e, t) === "kit").map((e) => e.repo)), x = [...v, ...Object.values(d).filter((e) => !y.has(e.repo))], S = /* @__PURE__ */ new Set(), C = async (e) => {
		let t = await l.run({ what: e });
		t && r?.(t.rows);
	};
	return x.length ? /* @__PURE__ */ g("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "check-rows",
		children: [
			/* @__PURE__ */ h("ul", {
				className: "br-probs",
				children: x.map((n, i) => {
					let a = bt(n, t), o = a === "kit" && !!n.repo && !S.has(n.repo);
					return o && S.add(n.repo), /* @__PURE__ */ g("li", {
						className: `br-prob is-${n.level}`,
						"data-level": n.level,
						children: [
							/* @__PURE__ */ h("span", {
								className: `br-prob-glyph tone-${tt[n.level] ?? "idle"}`,
								role: "img",
								"aria-label": nt[n.level] ?? n.level,
								children: rt[n.level] ?? "•"
							}),
							/* @__PURE__ */ g("span", {
								className: "br-prob-text br-pre",
								children: [n.repo && /* @__PURE__ */ h("span", {
									className: "br-tag br-prob-repo",
									title: n.repo,
									children: n.repo.replace(/\/+$/, "").split("/").pop()
								}), n.text]
							}),
							n.todo && /* @__PURE__ */ g("span", {
								className: "br-prob-todo",
								children: [/* @__PURE__ */ h("b", { children: "做什么" }), n.todo]
							}),
							(a || n.raw) && /* @__PURE__ */ g("span", {
								className: "br-prob-acts",
								children: [
									(a === "agent" || a === "engine") && /* @__PURE__ */ g("button", {
										type: "button",
										className: "br-btn is-small is-primary",
										disabled: l.busy,
										onClick: () => void C(a),
										children: [/* @__PURE__ */ h($, {
											name: "Wrench",
											size: 13
										}), yt(n, gt[a])]
									}),
									o && /* @__PURE__ */ h(Tt, {
										repo: n.repo,
										label: yt(n, "重装 kit 文件"),
										onHold: (e) => _(n, e),
										onDone: () => r?.(e)
									}),
									n.raw && /* @__PURE__ */ g("details", {
										className: "br-raw",
										children: [/* @__PURE__ */ h("summary", { children: "brain-kit 的原话" }), /* @__PURE__ */ h("pre", { children: n.raw })]
									})
								]
							})
						]
					}, o ? `kit:${n.repo}` : `${i}:${n.level}:${n.text}`);
				})
			}),
			l.result && /* @__PURE__ */ h("p", {
				className: `br-pre br-small ${l.result.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: l.result.text
			}),
			l.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			})
		]
	}) : o ? /* @__PURE__ */ h("p", {
		className: "br-empty",
		children: o
	}) : null;
}
var St = {
	todo: "○",
	running: "●",
	ok: "✓",
	warn: "!",
	fail: "✕"
}, Ct = {
	todo: "idle",
	running: "run",
	ok: "ok",
	warn: "warn",
	fail: "bad"
};
function wt({ job: e }) {
	let t = e.steps.find((e) => e.state === "running");
	return /* @__PURE__ */ g("div", {
		className: "br-stack",
		style: { gap: 4 },
		"data-testid": `job-${e.kind}`,
		"data-state": e.state,
		children: [
			/* @__PURE__ */ h("ol", {
				className: "br-jobsteps",
				"aria-label": "进度",
				children: e.steps.map((e) => /* @__PURE__ */ g("li", {
					className: `is-${e.state} tone-${Ct[e.state]}`,
					"data-step": e.id,
					"data-state": e.state,
					title: e.detail || e.label,
					children: [/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: St[e.state]
					}), /* @__PURE__ */ h("span", { children: e.label })]
				}, e.id))
			}),
			t && /* @__PURE__ */ g("span", {
				className: "br-hint",
				role: "status",
				children: [
					"正在",
					t.label,
					"…"
				]
			}),
			e.state === "failed" && e.error && /* @__PURE__ */ h("p", {
				className: "br-error br-pre",
				role: "alert",
				children: e.error
			})
		]
	});
}
function Tt({ repo: e, label: t = _t, onDone: n, onHold: r }) {
	let i = u(), [a, o] = c(!1), [s, l] = c(null), d = P(() => i.post(E.importChoices(), {
		path: e,
		purpose: "upgrade"
	})), f = P((t) => i.post(E.importUpgrade(), {
		path: e,
		mode: t
	})), p = () => {
		r?.(!1), n?.();
	}, _ = ye(J, (e) => {
		if (e.state !== "done") return r?.(!1);
		let t = e.result;
		(t?.mode !== "inplace" || t.commit.ok && !t.remote_url) && p();
	}), v = P(() => i.post(E.importCommit(), {
		path: e,
		purpose: "upgrade"
	})), y = P((e) => i.post(E.importPublish(), e)), b = _.job, x = b?.result ?? null, S = v.result ?? x?.commit, C = async (e) => {
		let t = await f.run(e);
		t && (r?.(!0), _.start(t.job));
	}, w = async () => {
		(await v.run())?.ok && !(x?.mode === "inplace" && x.remote_url) && p();
	}, T = async () => {
		let e = await d.run();
		if (e) {
			if (e.options.length === 1 && e.options[0].ok) return void C(e.options[0].mode);
			l(e);
		}
	}, D = d.busy || f.busy;
	if (!b) return /* @__PURE__ */ g("span", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "kit-fix-start",
		children: [s ? /* @__PURE__ */ h(Et, {
			choices: s,
			busy: D,
			onPick: (e) => void C(e),
			onCancel: () => l(null)
		}) : /* @__PURE__ */ h("span", {
			className: "br-row",
			style: { gap: 6 },
			children: /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small is-primary",
				disabled: D,
				onClick: () => void T(),
				title: "重装这个仓库的 brain-kit 文件，用你的 git 身份提交：默认直接在当前分支上，团队仓库可以选新分支开 MR",
				children: [/* @__PURE__ */ h($, {
					name: "Wrench",
					size: 13
				}), D ? "正在开始…" : t]
			})
		}), (d.error || f.error) && /* @__PURE__ */ h("span", {
			className: "br-error br-small",
			role: "alert",
			children: d.error || f.error
		})]
	});
	let O = x?.mode === "inplace";
	return /* @__PURE__ */ g("div", {
		className: "br-fixjob",
		"data-testid": "kit-fix",
		children: [
			/* @__PURE__ */ h(wt, { job: b }),
			_.readError && /* @__PURE__ */ h("p", {
				className: "br-note",
				role: "status",
				children: _.readError
			}),
			x && /* @__PURE__ */ g(m, { children: [
				x.text && /* @__PURE__ */ h("p", {
					className: "br-pre",
					role: "status",
					children: x.text
				}),
				S && !S.ok && S.text && /* @__PURE__ */ g("div", {
					className: "br-banner is-error",
					role: "alert",
					children: [/* @__PURE__ */ h("p", {
						className: "br-pre",
						children: S.text
					}), /* @__PURE__ */ h("div", {
						className: "br-row",
						children: /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small",
							disabled: v.busy,
							onClick: () => void w(),
							children: v.busy ? "正在提交…" : "再提交一次"
						})
					})]
				}),
				S?.ok && O && x.remote_url && /* @__PURE__ */ h(Dt, {
					path: e,
					branch: x.branch,
					remoteUrl: x.remote_url,
					target: x.target,
					onDone: p,
					onLater: p
				}),
				S?.ok && !O && !x.remote_url && x.target && /* @__PURE__ */ h(Ot, {
					path: e,
					purpose: "upgrade",
					onDone: n,
					p: {
						merge: {
							ok: !0,
							why: "",
							confirm: !1
						},
						pull: null,
						mr_url: null,
						target: x.target,
						remote_url: ""
					}
				}),
				S?.ok && !O && x.remote_url && !y.result?.ok && (a ? /* @__PURE__ */ g("div", {
					className: "br-confirm",
					role: "group",
					"aria-label": "确认推送",
					children: [/* @__PURE__ */ g("p", { children: [
						"会把分支 ",
						/* @__PURE__ */ h("code", { children: x.branch }),
						" 推到远端（",
						/* @__PURE__ */ h("code", { children: x.remote_url }),
						"）",
						x.gitlab_project ? /* @__PURE__ */ g(m, { children: [
							"，在 ",
							/* @__PURE__ */ h("code", { children: x.gitlab_project }),
							" 上开 MR：",
							/* @__PURE__ */ h("code", { children: x.branch }),
							" → ",
							/* @__PURE__ */ h("code", { children: x.target })
						] }) : "",
						"。"
					] }), /* @__PURE__ */ g("div", {
						className: "br-row",
						children: [/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small is-primary",
							disabled: y.busy,
							onClick: () => void y.run({
								path: e,
								branch: x.branch,
								target: x.target,
								remote_url: x.remote_url,
								confirm: !0,
								purpose: "upgrade"
							}).then(() => o(!1)),
							children: y.busy ? "正在推送…" : "确定推送"
						}), /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small",
							disabled: y.busy,
							onClick: () => o(!1),
							children: "取消"
						})]
					})]
				}) : /* @__PURE__ */ g("span", {
					className: "br-row",
					children: [/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => o(!0),
						children: [/* @__PURE__ */ h($, {
							name: "GitPullRequest",
							size: 13
						}), "推送并开 MR"]
					}), /* @__PURE__ */ g("span", {
						className: "br-hint",
						children: [
							"合进 ",
							x.target || "默认分支",
							" 以后，这一行就好了。"
						]
					})]
				})),
				y.result && /* @__PURE__ */ g("p", {
					className: `br-pre br-small ${y.result.ok ? "br-ok-text" : "br-bad-text"}`,
					role: "status",
					children: [
						y.result.text,
						y.result.mr && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ g(dt, {
							href: y.result.mr.url,
							children: ["MR !", y.result.mr.iid]
						})] }),
						!y.result.mr && y.result.new_mr_url && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ h(dt, {
							href: y.result.new_mr_url,
							children: "在 GitLab 上开 MR"
						})] })
					]
				}),
				y.error && /* @__PURE__ */ h("p", {
					className: "br-error",
					role: "alert",
					children: y.error
				}),
				v.error && /* @__PURE__ */ h("p", {
					className: "br-error",
					role: "alert",
					children: v.error
				})
			] })
		]
	});
}
function Et({ choices: e, busy: t, onPick: n, onCancel: r }) {
	return /* @__PURE__ */ g("div", {
		className: "br-modes",
		role: "group",
		"aria-label": "装在哪",
		"data-testid": "mode-pick",
		children: [e.options.map((r) => /* @__PURE__ */ g("div", {
			className: `br-mode${r.mode === e.recommend ? " is-rec" : ""}${r.ok ? "" : " is-off"}`,
			"data-mode": r.mode,
			children: [
				/* @__PURE__ */ h("button", {
					type: "button",
					className: `br-btn is-small${r.mode === e.recommend ? " is-primary" : ""}`,
					disabled: t || !r.ok,
					onClick: () => n(r.mode),
					children: r.title
				}),
				r.mode === e.recommend && /* @__PURE__ */ h("span", {
					className: "br-chip tone-ok",
					children: "推荐"
				}),
				/* @__PURE__ */ h("span", {
					className: "br-hint",
					children: r.ok ? r.line : r.why
				})
			]
		}, r.mode)), r && /* @__PURE__ */ h("button", {
			type: "button",
			className: "br-link br-small",
			onClick: r,
			children: "取消"
		})]
	});
}
function Dt({ path: e, branch: t, remoteUrl: n, target: r, onDone: i, onLater: a }) {
	let o = u(), [s, l] = c(!1), d = P(() => o.post(E.importPush(), {
		path: e,
		branch: t,
		remote_url: n,
		confirm: !0
	})), f = d.result, p = !!r && t === r, m = async () => {
		let e = await d.run();
		l(!1), e?.ok && i?.();
	};
	return /* @__PURE__ */ g("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "push-box",
		children: [
			!s && !f?.ok && /* @__PURE__ */ g("span", {
				className: "br-row",
				children: [
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						onClick: () => l(!0),
						children: [/* @__PURE__ */ h($, {
							name: "Upload",
							size: 13
						}), f ? "再推一次" : `推送 ${t}`]
					}),
					a && /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: a,
						children: "先不推送"
					}),
					/* @__PURE__ */ g("span", {
						className: "br-hint",
						children: [
							"推送以后才算数：开工从远端的 ",
							r || t,
							" 建分支，那里现在还没有它。"
						]
					})
				]
			}),
			s && /* @__PURE__ */ g("div", {
				className: "br-confirm",
				role: "group",
				"aria-label": "确认推送",
				"data-testid": "push-confirm",
				children: [
					/* @__PURE__ */ g("p", { children: [
						"会把分支 ",
						/* @__PURE__ */ h("code", { children: t }),
						" 推到远端（",
						/* @__PURE__ */ h("code", { children: n }),
						"），不强推。"
					] }),
					p && /* @__PURE__ */ g("p", {
						className: "br-warn-text",
						"data-testid": "push-team",
						children: [
							"这会直接改团队的 ",
							t,
							"，没有 MR 评审；",
							t,
							" 受保护时推不上去，就改用「装到新分支，开 MR 给团队看」。"
						]
					}),
					/* @__PURE__ */ g("div", {
						className: "br-row",
						children: [/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small is-primary",
							disabled: d.busy,
							onClick: () => void m(),
							children: d.busy ? "正在推送…" : "确定推送"
						}), /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small",
							disabled: d.busy,
							onClick: () => l(!1),
							children: "取消"
						})]
					})
				]
			}),
			f && /* @__PURE__ */ h("p", {
				className: `br-pre br-small ${f.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: f.text
			}),
			d.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: d.error
			})
		]
	});
}
function Ot({ path: e, p: t, purpose: n, onDone: r }) {
	let i = u(), [a, o] = c(!1), s = P((t) => i.post(E.importMerge(), {
		path: e,
		confirm: t,
		...n ? { purpose: n } : {}
	})), l = P(() => i.post(E.importPull(), { path: e })), d = s.result, f = t.target || "默认分支", p = async (e) => {
		let t = await s.run(e);
		o(!1), t?.ok && !t.remote_url && r?.();
	}, m = async () => {
		(await l.run())?.ok && r?.();
	};
	return /* @__PURE__ */ g("div", {
		className: "br-stack",
		style: { gap: 6 },
		"data-testid": "pending-actions",
		children: [
			t.mr_url && /* @__PURE__ */ g("p", {
				className: "br-small",
				children: [
					"MR 开着：",
					/* @__PURE__ */ h(dt, {
						href: t.mr_url,
						children: "在 GitLab 上看 MR"
					}),
					"（在那里合并是团队的做法，合并以后点「拉取」）"
				]
			}),
			t.merge && !d?.ok && (t.merge.ok ? a ? /* @__PURE__ */ g("div", {
				className: "br-confirm",
				role: "group",
				"aria-label": "确认合并",
				"data-testid": "merge-confirm",
				children: [/* @__PURE__ */ g("p", { children: [
					"在本机把它快进合并到 ",
					/* @__PURE__ */ h("code", { children: f }),
					"。远端（",
					/* @__PURE__ */ h("code", { children: t.remote_url }),
					"）还没有它，要你自己推送。"
				] }), /* @__PURE__ */ g("div", {
					className: "br-row",
					children: [/* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						disabled: s.busy,
						onClick: () => void p(!0),
						children: s.busy ? "正在合并…" : "确定合并"
					}), /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: s.busy,
						onClick: () => o(!1),
						children: "取消"
					})]
				})]
			}) : /* @__PURE__ */ g("span", {
				className: "br-row",
				children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: `br-btn is-small${t.merge.confirm ? "" : " is-primary"}`,
					disabled: s.busy,
					onClick: () => t.merge?.confirm ? o(!0) : void p(!1),
					children: [/* @__PURE__ */ h($, {
						name: "GitMerge",
						size: 13
					}), s.busy ? "正在合并…" : t.merge.confirm ? `在本机合并到 ${f}` : `合并到 ${f}`]
				}), /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: "快进合并，不多一个提交；装用的工作目录和分支随后删掉。"
				})]
			}) : /* @__PURE__ */ h("p", {
				className: "br-small br-warn-text",
				"data-testid": "merge-why",
				children: t.merge.why
			})),
			d && /* @__PURE__ */ h("p", {
				className: `br-pre br-small ${d.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: d.text
			}),
			d?.ok && d.remote_url && /* @__PURE__ */ h(Dt, {
				path: e,
				branch: d.branch,
				remoteUrl: d.remote_url,
				target: t.target,
				onDone: r,
				onLater: r
			}),
			t.pull && !l.result?.ok && (t.pull.ok ? /* @__PURE__ */ g("span", {
				className: "br-row",
				children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-small is-primary",
					disabled: l.busy,
					onClick: () => void m(),
					children: [/* @__PURE__ */ h($, {
						name: "Download",
						size: 13
					}), l.busy ? "正在拉取…" : "拉取"]
				}), /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: "只快进：不合并、不变基，你的改动不动。"
				})]
			}) : /* @__PURE__ */ h("p", {
				className: "br-small br-warn-text",
				"data-testid": "pull-why",
				children: t.pull.why
			})),
			l.result && /* @__PURE__ */ h("p", {
				className: `br-pre br-small ${l.result.ok ? "br-ok-text" : "br-bad-text"}`,
				role: "status",
				children: l.result.text
			}),
			(s.error || l.error) && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: s.error || l.error
			})
		]
	});
}
var kt = {
	session: "回答会送进你的本地会话",
	mr: "回答会以你的 GitLab 身份发在 MR 上"
}, At = [{
	value: "approve",
	label: "同意（approve）"
}, {
	value: "reject",
	label: "不同意（reject）"
}];
function jt({ question: e, repo: t, reqKey: n, onDone: r }) {
	let i = u(), [a, o] = c(""), [s, l] = c(""), d = P((e) => i.post(E.answer(t, n), e));
	if (!e.answerable_here || e.lean_request) return null;
	let f = `answer-${t}-${n}-${e.id ?? e.question.slice(0, 16)}`, p = async () => {
		let t = { choice: a.trim() };
		s.trim() && (t.note = s.trim()), e.id && (t.id = e.id);
		let n = await d.run(t);
		n && (o(""), l(""), r?.(n));
	};
	return /* @__PURE__ */ g("form", {
		className: "br-stack",
		style: { gap: 8 },
		"aria-label": `回答 ${e.id ?? n}`,
		onSubmit: (e) => {
			e.preventDefault(), p();
		},
		children: [
			e.options.length > 0 ? /* @__PURE__ */ g("fieldset", {
				className: "br-fieldset",
				children: [/* @__PURE__ */ h("legend", { children: "选一个" }), e.options.map((t) => /* @__PURE__ */ g("label", {
					className: "br-check",
					children: [/* @__PURE__ */ h("input", {
						type: "radio",
						name: f,
						value: t.id,
						checked: a === t.id,
						onChange: () => o(t.id)
					}), /* @__PURE__ */ g("span", { children: [
						/* @__PURE__ */ h("b", {
							className: "br-mono",
							children: t.id
						}),
						" ",
						t.text,
						e.recommend === t.id && /* @__PURE__ */ h("span", {
							className: "br-chip tone-ok",
							style: { marginLeft: 6 },
							children: "推荐"
						})
					] })]
				}, t.id))]
			}) : /* @__PURE__ */ g("fieldset", {
				className: "br-fieldset",
				children: [/* @__PURE__ */ h("legend", { children: "同意吗" }), At.map((e) => /* @__PURE__ */ g("label", {
					className: "br-check",
					children: [/* @__PURE__ */ h("input", {
						type: "radio",
						name: f,
						value: e.value,
						checked: a === e.value,
						onChange: () => o(e.value)
					}), /* @__PURE__ */ h("span", { children: e.label })]
				}, e.value))]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-field",
				children: [/* @__PURE__ */ h("label", {
					htmlFor: `${f}-note`,
					children: "补一句（可不填）"
				}), /* @__PURE__ */ h("textarea", {
					id: `${f}-note`,
					rows: 2,
					value: s,
					onChange: (e) => l(e.target.value)
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [/* @__PURE__ */ h("button", {
					type: "submit",
					className: "br-btn is-primary",
					disabled: !a.trim() || d.busy,
					children: d.busy ? "正在发…" : "回答"
				}), e.answer_via && /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: kt[e.answer_via]
				})]
			}),
			d.result && /* @__PURE__ */ h("p", {
				className: "br-pre br-ok-text",
				role: "status",
				children: d.result.text
			}),
			d.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: d.error
			})
		]
	});
}
var Mt = "先导入一个项目仓库：本机的目录，或者从 GitLab 克隆。app 会先检查它；没装 brain-kit 的，直接装在当前分支并提交，当天就能开需求（团队仓库推送以后就能开；也可以装到新分支、开 MR，合并以后才能开）。", Nt = [
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
		text: "装好自动加入：交付总览、开需求就能用"
	}
];
function Pt({ onImport: e, title: t = "还没有仓库", punch: n = "导入以后，每个需求都在这里：在哪一步、等谁、花了多少。" }) {
	return /* @__PURE__ */ h(Vt, {
		testid: "import-cta",
		label: "导入仓库",
		title: t,
		text: [Mt],
		punch: n,
		flow: Nt,
		children: /* @__PURE__ */ g("button", {
			type: "button",
			className: "br-btn is-primary is-big",
			onClick: e,
			children: [/* @__PURE__ */ h(Y, {
				role: "import",
				size: 17
			}), "导入仓库"]
		})
	});
}
function Ft({ repo: e, onOpen: t, onDone: n, banner: r = !1 }) {
	let i = e.pending;
	if (!i) return null;
	let a = i.remote_url ? {
		...i,
		merge: null
	} : i, o = !!(a.merge || a.pull || a.mr_url), s = !o || a.state === "uncommitted" || a.state === "branch" && !!a.remote_url || !!a.merge && !a.merge.ok;
	return /* @__PURE__ */ g("div", {
		className: r ? "br-banner is-info" : "br-stack",
		style: r ? void 0 : { gap: 4 },
		role: "status",
		"data-testid": "repo-pending",
		"data-repo": e.id,
		children: [/* @__PURE__ */ g("div", {
			className: "br-row",
			children: [/* @__PURE__ */ g("span", { children: [
				r && /* @__PURE__ */ g("b", {
					className: "br-strong",
					children: [e.name, "："]
				}),
				a.text,
				"。",
				a.next
			] }), s && /* @__PURE__ */ h("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: t,
				children: "去导入仓库"
			})]
		}), o && /* @__PURE__ */ h(Ot, {
			path: e.path,
			p: a,
			onDone: n
		}, `${a.state}:${a.branch}`)]
	});
}
var It = /^[a-z0-9][a-z0-9._-]{0,63}$/, Lt = "只能用小写字母、数字和 . _ -（字母或数字开头）";
function Rt({ path: e, me: t, onSaved: n }) {
	let r = u(), [i, a] = c(t.suggest), o = P((t) => r.post(E.meName(), {
		path: e,
		name: t
	})), s = i.trim().toLowerCase(), l = !!s && !It.test(s), d = o.result;
	if (d || !t.ask) {
		let e = d?.me ?? t;
		return /* @__PURE__ */ g("p", {
			className: `br-me${e.error ? " is-bad" : ""}`,
			"data-testid": "me-line",
			children: [
				/* @__PURE__ */ h(Y, {
					role: "person",
					size: 15
				}),
				/* @__PURE__ */ h("span", { children: e.text || e.error }),
				d && /* @__PURE__ */ h("span", {
					className: "br-ok-text br-small",
					role: "status",
					children: "已保存"
				})
			]
		});
	}
	let f = `me-${e.replace(/[^A-Za-z0-9]+/g, "-")}`, p = async () => {
		let e = await o.run(s);
		e && n?.(e);
	}, m = !o.busy && !!s && !l;
	return /* @__PURE__ */ g("div", {
		className: "br-me-ask",
		role: "group",
		"aria-label": t.label,
		"data-testid": "me-ask",
		children: [
			/* @__PURE__ */ h("label", {
				htmlFor: f,
				children: t.label
			}),
			/* @__PURE__ */ g("span", {
				className: "br-row",
				children: [/* @__PURE__ */ h("input", {
					id: f,
					type: "text",
					className: "br-mono",
					value: i,
					spellCheck: !1,
					autoComplete: "off",
					"aria-invalid": l || void 0,
					onChange: (e) => a(e.target.value),
					onKeyDown: (e) => {
						e.key === "Enter" && (e.preventDefault(), m && p());
					}
				}), /* @__PURE__ */ h("button", {
					type: "button",
					className: "br-btn is-small is-primary",
					disabled: !m,
					onClick: () => void p(),
					children: o.busy ? "正在保存…" : "保存"
				})]
			}),
			t.error && /* @__PURE__ */ h("span", {
				className: "br-warn-text br-small",
				children: t.error
			}),
			/* @__PURE__ */ h("span", {
				className: "br-hint",
				children: l ? Lt : t.why
			}),
			o.error && /* @__PURE__ */ h("span", {
				className: "br-error",
				role: "alert",
				children: o.error
			})
		]
	});
}
function zt({ loading: e, error: t, has: n }) {
	return t ? /* @__PURE__ */ h("div", {
		className: `br-banner${n ? "" : " is-error"}`,
		role: "alert",
		children: n ? `刷新没成：${t}，显示的是上一次拿到的数据` : t
	}) : e && !n ? /* @__PURE__ */ h("p", {
		className: "br-loading",
		children: "正在读取…"
	}) : null;
}
function Bt({ steps: e, label: t, numbered: n = !0 }) {
	return /* @__PURE__ */ h("ol", {
		className: "br-flow",
		style: { "--n": e.length },
		"aria-label": t,
		children: e.map((e, t) => /* @__PURE__ */ g("li", {
			className: e.state ? `is-${e.state}` : void 0,
			"data-state": e.state,
			children: [
				/* @__PURE__ */ h(Y, {
					role: e.icon,
					size: 26
				}),
				/* @__PURE__ */ g("b", { children: [n && /* @__PURE__ */ h("span", {
					className: "br-flow-n",
					children: e.state === "done" ? "✓" : t + 1
				}), e.title] }),
				e.text && /* @__PURE__ */ h("small", { children: e.text })
			]
		}, `${e.title}-${t}`))
	});
}
function Vt({ title: e, text: t, punch: n, flow: r, children: i, testid: a, label: o }) {
	return /* @__PURE__ */ g("section", {
		className: "br-hero",
		"data-testid": a,
		"aria-label": o ?? e,
		children: [
			/* @__PURE__ */ g("div", { children: [
				/* @__PURE__ */ h("h2", { children: e }),
				t?.map((e, t) => /* @__PURE__ */ h("p", { children: e }, t)),
				n && /* @__PURE__ */ h("p", {
					className: "br-punch",
					children: n
				})
			] }),
			r && /* @__PURE__ */ h(Bt, { steps: r }),
			i && /* @__PURE__ */ h("div", {
				className: "br-hero-acts",
				children: i
			})
		]
	});
}
function Ht({ label: e, value: t, of: n, note: r, tone: i, children: a, testid: o }) {
	return /* @__PURE__ */ g("div", {
		className: `br-kpi${i ? ` is-${i}` : ""}`,
		"data-testid": o,
		children: [
			/* @__PURE__ */ h("div", {
				className: "br-kpi-label",
				children: e
			}),
			/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
				className: "br-kpi-big",
				children: t
			}), n !== void 0 && /* @__PURE__ */ h("span", {
				className: "br-kpi-of",
				children: n
			})] }),
			a,
			r && /* @__PURE__ */ h("div", {
				className: "br-kpi-note",
				children: r
			})
		]
	});
}
function Ut({ cells: e, label: t }) {
	return /* @__PURE__ */ h("div", {
		className: "kt-segs br-segs",
		role: "img",
		"aria-label": t,
		children: e.map((e, t) => /* @__PURE__ */ h("i", {
			className: e.tone === "pass" ? "is-pass" : e.tone === "fail" ? "is-fail" : e.tone === "run" ? "is-run" : "",
			title: e.title
		}, t))
	});
}
var Wt = "git clone https://github.com/warren830/brain-kit.git ~/brain-kit", Gt = (e) => /^[\w@%+=:,./~-]+$/.test(e) ? e : `'${e.replace(/'/g, "'\\''")}'`;
function Kt(e, t = "", n = !1) {
	let r = t ? `git -C ${Gt(t)} pull --ff-only` : "", i = n ? "再点下面的「保存」重新读它" : "再到设置里点「保存」重新读它";
	return /太旧/.test(e) ? {
		kind: "old",
		text: "brain-kit 太旧了（位置是对的）",
		todo: `在它的目录里拉取最新的代码${r ? "（点「复制」拿命令）" : ""}，${i}`,
		cmd: r,
		raw: e
	} : /导入失败/.test(e) ? {
		kind: "broken",
		text: "brain-kit 读不进来（位置是对的）",
		todo: `那个目录里的 brain-kit 不完整：拉取一遍${r ? "（点「复制」拿命令）" : ""}，还不行就重新克隆一份；${i}`,
		cmd: r,
		raw: e
	} : {
		kind: "missing",
		text: "找不到 brain-kit",
		todo: `在${n ? "下面" : "设置"}的「brain-kit 在哪」写上它的目录，点「保存」；这台机器上还没有的话，先在终端里克隆一份（点「复制」拿命令），再写它的位置`,
		cmd: Wt,
		raw: e
	};
}
function qt({ cmd: e }) {
	let [t, n] = c(""), r = async () => {
		try {
			await navigator.clipboard.writeText(e), n("ok");
		} catch {
			n("fail");
		}
	};
	return /* @__PURE__ */ g("span", {
		className: "br-cmd",
		"data-testid": "cmd-line",
		children: [
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => void r(),
				children: [/* @__PURE__ */ h($, {
					name: "Copy",
					size: 13
				}), "复制"]
			}),
			t === "ok" && /* @__PURE__ */ h("span", {
				className: "br-small br-ok-text",
				role: "status",
				children: "已复制"
			}),
			t === "fail" && /* @__PURE__ */ h("span", {
				className: "br-small br-bad-text",
				role: "status",
				children: "没复制成：请手动选中这一行"
			})
		]
	});
}
function Jt(e, t) {
	if (t.filter((t) => t.name === e.name).length < 2) return e.name;
	let n = e.path.replace(/\/+$/, "").split("/").slice(-2, -1)[0];
	return n ? `${e.name}（${n}/）` : e.name;
}
//#endregion
//#region src/AppBar.tsx
var Yt = [
	["overview", "全部需求：结果、需求流动、交付清单"],
	["item", "一个需求：周期、时间花在哪、成本、检查、决定和问题"],
	["board", "一个需求怎么走：你、本机会话、Lean 的审批、交接、运行机、检查、验收"],
	["new", "认领一个需求，文档过五关，开工"],
	["brain", "仓库里的共享知识：条目、检查、用处、回写"],
	["todo", "等你做的事"],
	["team", "团队运行机：交接、运行、签名"]
].map(([e, t]) => [
	e,
	W[e],
	t
]);
function Xt({ view: e, onView: t, item: n, gone: r = !1, picking: i, todo: a, team: o }) {
	return /* @__PURE__ */ g("header", {
		className: "br-bar",
		"data-testid": "br-appbar",
		children: [
			/* @__PURE__ */ g("h1", { children: [/* @__PURE__ */ h(Y, {
				role: "brain",
				size: 16
			}), "Brain 交付"] }),
			/* @__PURE__ */ h("div", {
				className: "br-tabs",
				role: "tablist",
				"aria-label": "视图",
				children: Yt.filter(([t]) => t !== "team" || o || e === "team").map(([s, c, l]) => {
					let u = s === "item" || s === "board", d = s === "team" && !o, f = u && !!n && r && e !== s;
					return /* @__PURE__ */ g("button", {
						type: "button",
						role: "tab",
						"aria-selected": e === s,
						disabled: u && !n && !!i,
						"aria-disabled": f || void 0,
						className: d || f ? "is-off" : void 0,
						title: d ? "这台机器不是团队运行机" : f ? `没有 ${n} 这个需求：${c}打不开` : u ? n ? `${l}（${n}）` : `${l}（打开等你的那个需求，没有就打开最近的）` : l,
						"aria-label": s === "todo" && a > 0 ? `待办 ${a}` : u && n ? `${c} ${n}` : void 0,
						onClick: () => e !== s && !f && t(s),
						children: [
							c,
							u && n && /* @__PURE__ */ h("span", {
								className: "br-bar-key",
								children: n
							}),
							s === "todo" && a > 0 && /* @__PURE__ */ h("span", {
								className: "br-count",
								"aria-hidden": "true",
								children: a
							})
						]
					}, s);
				})
			}),
			/* @__PURE__ */ h("span", { className: "br-grow" }),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn",
				"aria-pressed": e === "import",
				onClick: () => e !== "import" && t("import"),
				title: "本机目录或克隆：先检查它，没装 brain-kit 的直接装上",
				children: [/* @__PURE__ */ h($, {
					name: "FolderPlus",
					size: 14
				}), W.import]
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn",
				"aria-pressed": e === "settings",
				onClick: () => e !== "settings" && t("settings"),
				title: "brain-kit、仓库、团队模式",
				children: [/* @__PURE__ */ h($, {
					name: "Settings",
					size: 14
				}), W.settings]
			})
		]
	});
}
//#endregion
//#region src/views/Family.tsx
var Zt = `Lean 照常做需求和设计，设计里拆单元（unit-of-work.md）；你批了设计，就是批了这个拆法；批完在需求看板上点「${Q.split}」。`, Qt = {
	unclaimed: {
		tone: "idle",
		icon: "person",
		glyph: "◌",
		seg: ""
	},
	claimed: {
		tone: "queue",
		icon: "person",
		glyph: "○",
		seg: "is-claimed"
	},
	in_progress: {
		tone: "run",
		icon: "laptop",
		glyph: "●",
		seg: "is-run"
	},
	merged: {
		tone: "ok",
		icon: "merge",
		glyph: "✔",
		seg: "is-pass"
	},
	closed: {
		tone: "idle",
		icon: "blocked",
		glyph: "■",
		seg: ""
	}
}, $t = {
	in_progress: "run",
	ready_to_release: "approve",
	done: "ok",
	closed: "idle"
}, en = {
	new: "ok",
	same: "idle",
	update: "info",
	changed: "warn",
	close: "bad",
	removed: "bad",
	close_duplicate: "warn",
	duplicate: "warn",
	raced: "warn"
};
function tn(e, t, r) {
	let a = u(), o = b(r), s = P((n) => a.post(E.claim(e, t), n)), l = P((n) => a.post(E.childStart(e, t), n)), d = P(() => a.post(E.sync(e, t), {})), f = P(() => a.post(E.split(e, t), { apply: !1 })), p = P(() => a.post(E.split(e, t), { apply: !0 })), [m, h] = c(null), [g, _] = c(!1), [v, y] = c(!1), [x, S] = c(!0), C = b([
		s.reset,
		l.reset,
		d.reset,
		f.reset,
		p.reset
	]);
	i(() => {
		for (let e of C.current) e();
		h(null), _(!1), y(!1);
	}, [
		e,
		t,
		C
	]);
	let w = n((e) => {
		e && o.current();
	}, [o]);
	return {
		claim: s,
		start: l,
		sync: d,
		preview: f,
		apply: p,
		last: m,
		asking: g,
		setAsking: _,
		splitOpen: v,
		trust: x,
		setTrust: S,
		busy: s.busy || l.busy || d.busy || f.busy || p.busy,
		doClaim: async () => {
			h("claim"), w(await s.run({}));
		},
		doRelease: async () => {
			h("release"), _(!1), w(await s.run({ release: !0 }));
		},
		doStart: async (e) => {
			h("start"), w(await l.run({
				...e ? { on: e } : {},
				open_session: !0,
				trust: x
			}));
		},
		doSync: async () => {
			h("sync"), w(await d.run());
		},
		openSplit: async () => {
			p.reset(), y(!0), await f.run();
		},
		applySplit: async () => {
			(await p.run())?.ok && o.current();
		},
		closeSplit: () => {
			y(!1), f.reset(), p.reset();
		}
	};
}
function nn({ f: e, repo: t, reqKey: n, ctl: r, look: i, go: a, rollup: o = null, quiet: s = !1 }) {
	let c = (e) => a({
		kind: "board",
		repo: t,
		key: e,
		...i === "detail" ? { from: "item" } : {}
	}), l = e.role === "parent" ? "拆成的小需求" : e.role === "child" ? `${e.parent} 的小需求` : "大需求";
	return /* @__PURE__ */ g("section", {
		className: `${i === "board" ? "kt-card" : "cto-card"} br-fam is-${e.role}`,
		"aria-label": l,
		"data-testid": "fam-panel",
		"data-role": e.role,
		children: [
			/* @__PURE__ */ h("style", { children: An }),
			e.role === "parent" && /* @__PURE__ */ h(on, {
				f: e,
				look: i,
				rollup: i === "board" ? o : null,
				onOpen: c,
				split: s ? null : e.acts.split,
				ctl: r
			}),
			e.role === "child" && /* @__PURE__ */ h(fn, {
				f: e,
				look: i,
				onParent: () => c(e.parent)
			}),
			e.role === "big" && /* @__PURE__ */ h(mn, {
				f: e,
				look: i,
				split: s ? null : e.acts.split,
				ctl: r
			}),
			!s && e.role === "child" && /* @__PURE__ */ h(vn, {
				f: e,
				ctl: r,
				reqKey: n,
				onBoard: i === "detail" ? c : void 0
			}),
			!s && r.splitOpen && /* @__PURE__ */ h(En, { ctl: r }),
			e.source === "local" && /* @__PURE__ */ h("p", {
				className: "kt-dim br-small br-fam-local",
				children: "brain-kit 还没回话：按本机上次拉到的认领显示。"
			})
		]
	});
}
function rn({ look: e, title: t, children: n }) {
	return e === "board" ? /* @__PURE__ */ g("header", {
		className: "kt-card-head br-fam-head",
		children: [/* @__PURE__ */ h("h2", { children: t }), n]
	}) : /* @__PURE__ */ g("div", {
		className: "cto-chart-head br-fam-head",
		children: [/* @__PURE__ */ h("h3", { children: t }), n]
	});
}
function an(e) {
	if (e.progress) return e.progress;
	let t = (t) => e.children.filter((e) => e.state === t).length, n = t("closed");
	return {
		merged: t("merged"),
		total: e.children.length - n,
		unclaimed: t("unclaimed"),
		claimed: t("claimed"),
		in_progress: t("in_progress"),
		closed: n,
		text: ""
	};
}
function on({ f: e, look: t, rollup: n, onOpen: r, split: i, ctl: a }) {
	let o = an(e), s = [
		{
			n: o.unclaimed,
			label: Ne.unclaimed,
			tone: "idle"
		},
		{
			n: o.claimed,
			label: Ne.claimed,
			tone: "queue"
		},
		{
			n: o.in_progress,
			label: Ne.in_progress,
			tone: "run"
		},
		{
			n: o.closed,
			label: Ne.closed,
			tone: "idle"
		}
	], c = e.children.filter((e) => e.state !== "closed");
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ g(rn, {
			look: t,
			title: "拆成的小需求",
			children: [
				e.family_label && /* @__PURE__ */ h("span", {
					className: `kt-pill tone-${e.family_state ? $t[e.family_state] : "info"}`,
					"data-testid": "fam-label",
					children: e.family_label
				}),
				/* @__PURE__ */ h("span", {
					className: `kt-pill tone-${e.released ? "ok" : "idle"}`,
					children: e.released ? `${Oe.RELEASE}过了` : "还没发布"
				}),
				e.branch && /* @__PURE__ */ g("span", {
					className: "kt-dim br-small",
					children: ["合回 ", /* @__PURE__ */ h("code", { children: e.branch })]
				}),
				i && !a.splitOpen && /* @__PURE__ */ h("span", {
					className: "br-fam-head-acts",
					children: /* @__PURE__ */ h(hn, {
						act: i,
						ctl: a,
						primary: !1,
						hint: "拆法变了、设计又批了：再拆一次"
					})
				})
			]
		}),
		/* @__PURE__ */ g("div", {
			className: "br-fam-sum",
			role: "group",
			"aria-label": "小需求的进度",
			children: [/* @__PURE__ */ g("div", {
				className: "br-fam-merged",
				"data-testid": "fam-merged",
				"aria-label": `已合并 ${o.merged}/${o.total}`,
				title: o.text || void 0,
				children: [
					/* @__PURE__ */ h("div", {
						className: "kt-kpi-label",
						children: Ne.merged
					}),
					/* @__PURE__ */ g("div", {
						className: "kt-kpi-value",
						children: [/* @__PURE__ */ h("span", {
							className: `kt-kpi-big${o.total > 0 && o.merged === o.total ? " tone-ok" : ""}`,
							children: o.merged
						}), /* @__PURE__ */ g("span", {
							className: "kt-kpi-of",
							children: ["/", o.total]
						})]
					}),
					/* @__PURE__ */ h("div", {
						className: "kt-segs",
						"aria-hidden": "true",
						children: c.map((e) => /* @__PURE__ */ h("i", {
							className: Qt[e.state].seg,
							title: `${e.key}：${e.state_label}`
						}, e.key))
					})
				]
			}), /* @__PURE__ */ h("ul", {
				className: "br-fam-counts",
				children: s.map((e) => /* @__PURE__ */ g("li", {
					className: `tone-${e.tone}${e.n ? "" : " is-zero"}`,
					children: [/* @__PURE__ */ h("b", { children: e.n }), /* @__PURE__ */ h("small", { children: e.label })]
				}, e.label))
			})]
		}),
		e.children.length === 0 ? /* @__PURE__ */ h("p", {
			className: "kt-dim br-small",
			children: "还没有登记小需求。"
		}) : /* @__PURE__ */ h("div", {
			className: "br-fam-lanes",
			role: "list",
			"aria-label": "小需求",
			children: e.children.map((e) => /* @__PURE__ */ h(sn, {
				c: e,
				numbers: n ? n.children.find((t) => t.key === e.key)?.numbers ?? null : void 0,
				onOpen: () => r(e.key)
			}, e.key))
		}),
		n && /* @__PURE__ */ h(dn, { r: n })
	] });
}
function sn({ c: e, numbers: t, onOpen: n }) {
	let r = Qt[e.state] ?? Qt.unclaimed, i = e.state !== "merged" && e.state !== "closed";
	return /* @__PURE__ */ g("article", {
		role: "listitem",
		className: `kt-lane br-fam-lane is-${e.state} tone-${r.tone}`,
		"data-testid": "fam-child",
		"data-key": e.key,
		"data-state": e.state,
		"aria-label": `${e.key}：${e.state_label}`,
		onClick: n,
		children: [
			/* @__PURE__ */ g("div", {
				className: "kt-lane-id",
				children: [/* @__PURE__ */ h("span", {
					className: "kt-avatar",
					"aria-hidden": "true",
					children: /* @__PURE__ */ h(Y, {
						role: r.icon,
						size: 22
					})
				}), /* @__PURE__ */ g("div", {
					className: "kt-lane-who",
					children: [
						/* @__PURE__ */ h("div", {
							className: "kt-lane-name",
							children: /* @__PURE__ */ h("button", {
								type: "button",
								className: "br-fam-key",
								title: "看它的需求看板",
								onClick: (e) => {
									e.stopPropagation(), n();
								},
								children: e.key
							})
						}),
						/* @__PURE__ */ h("div", {
							className: "kt-lane-doing",
							children: e.unit ? `单元 ${e.unit}` : "没有单元名"
						}),
						/* @__PURE__ */ h("div", {
							className: "kt-lane-tag",
							children: /* @__PURE__ */ g("span", {
								className: `kt-pill tone-${r.tone}`,
								children: [/* @__PURE__ */ h("i", {
									"aria-hidden": "true",
									children: r.glyph
								}), e.state_label]
							})
						})
					]
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-lane-live",
				children: [
					/* @__PURE__ */ h("div", {
						className: "br-fam-title",
						children: e.title || "—"
					}),
					e.depends_on.length > 0 ? /* @__PURE__ */ g("div", {
						className: "br-fam-deps",
						"aria-label": "依赖",
						children: [/* @__PURE__ */ h("span", {
							className: "kt-dim",
							children: "依赖"
						}), e.depends_on.map((t) => {
							let n = e.blocked_by.includes(t);
							return /* @__PURE__ */ g("span", {
								className: `kt-pill tone-${n ? "warn" : "ok"}`,
								title: n ? "还没合进大需求的分支" : "合进大需求的分支了",
								children: [/* @__PURE__ */ h("i", {
									"aria-hidden": "true",
									children: n ? "⏸" : "✔"
								}), t]
							}, t);
						})]
					}) : /* @__PURE__ */ h("div", {
						className: "kt-dim br-small",
						children: "不依赖别的小需求"
					}),
					i && e.blocked_by.length > 0 && /* @__PURE__ */ g("div", {
						className: "kt-situation tone-warn",
						"data-testid": "fam-blocked",
						children: [/* @__PURE__ */ h("strong", { children: "等依赖：" }), /* @__PURE__ */ g("span", {
							className: "kt-summary",
							children: [e.blocked_by.join("、"), " 还没合进大需求的分支"]
						})]
					})
				]
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-lane-work",
				children: [/* @__PURE__ */ g("p", {
					className: "br-fam-owner",
					children: [/* @__PURE__ */ h(Y, {
						role: "person",
						size: 14
					}), e.owner ? /* @__PURE__ */ h("b", { children: e.owner }) : /* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: "没人认领"
					})]
				}), t !== void 0 && /* @__PURE__ */ h(un, { n: t })]
			})
		]
	});
}
var cn = (...e) => e.every((e) => e === null) ? null : e.reduce((e, t) => e + (t ?? 0), 0), ln = (e) => e === null ? "—" : String(e);
function un({ n: e }) {
	return e ? /* @__PURE__ */ g("ul", {
		className: "kt-tools br-fam-lanenums",
		"aria-label": "它的数",
		children: [
			/* @__PURE__ */ g("li", { children: ["提交 ", /* @__PURE__ */ h("b", { children: ln(cn(e.commits_bot, e.commits_person)) })] }),
			/* @__PURE__ */ g("li", { children: [
				Ge.verify,
				" ",
				/* @__PURE__ */ h("b", { children: ln(e.verify_rounds) }),
				" 轮"
			] }),
			/* @__PURE__ */ g("li", { children: ["人介入 ", /* @__PURE__ */ h("b", { children: ln(cn(e.human_at_judgment, e.human_outside_judgment)) })] }),
			/* @__PURE__ */ g("li", { children: [/* @__PURE__ */ h("b", { children: ce(e.credits) }), " credits"] })
		]
	}) : /* @__PURE__ */ h("p", {
		className: "kt-dim kt-nothing",
		children: "brain-kit 记下的时间线里还没有它的数"
	});
}
function dn({ r: e }) {
	let t = e.total, n = e.own, r = [
		{
			label: "提交",
			value: ln(t ? cn(t.commits_bot, t.commits_person) : null),
			sub: `AI ${ln(t?.commits_bot ?? null)} · 人 ${ln(t?.commits_person ?? null)}`,
			own: ln(n ? cn(n.commits_bot, n.commits_person) : null)
		},
		{
			label: Ge.verify,
			value: ln(t?.verify_rounds ?? null),
			sub: `轮 · 没过 ${ln(t?.verify_failed ?? null)}`,
			own: ln(n?.verify_rounds ?? null)
		},
		{
			label: "人介入",
			value: ln(t ? cn(t.human_at_judgment, t.human_outside_judgment) : null),
			sub: `判断点上 ${ln(t?.human_at_judgment ?? null)} · 判断点之外 ${ln(t?.human_outside_judgment ?? null)}`,
			own: ln(n ? cn(n.human_at_judgment, n.human_outside_judgment) : null),
			warn: (t?.human_outside_judgment ?? 0) > 0
		},
		{
			label: "credits",
			value: ce(t?.credits ?? null),
			sub: "KiroCrew 只报 credits",
			own: ce(n?.credits ?? null)
		}
	];
	return /* @__PURE__ */ g("div", {
		className: "br-fam-roll",
		role: "group",
		"aria-label": "整个大需求加起来",
		"data-testid": "fam-rollup",
		children: [
			/* @__PURE__ */ g("div", {
				className: "br-fam-roll-head",
				children: [/* @__PURE__ */ h("b", { children: "整个大需求加起来" }), /* @__PURE__ */ h("span", {
					className: "kt-dim br-small",
					children: "brain-kit 记下的：大需求自己，加上每个小需求"
				})]
			}),
			/* @__PURE__ */ h("ul", {
				className: "br-fam-nums",
				children: r.map((e) => /* @__PURE__ */ g("li", {
					className: `br-fam-num${e.warn ? " is-warn" : ""}`,
					"aria-label": `${e.label} ${e.value}`,
					children: [
						/* @__PURE__ */ h("small", { children: e.label }),
						/* @__PURE__ */ h("b", { children: e.value }),
						/* @__PURE__ */ h("span", { children: e.sub }),
						/* @__PURE__ */ g("span", {
							className: "kt-dim",
							children: ["大需求自己 ", e.own]
						})
					]
				}, e.label))
			}),
			e.unknown.length > 0 && /* @__PURE__ */ g("p", {
				className: "br-small br-fam-unknown",
				"data-testid": "fam-unknown",
				children: ["不知道的（没有记录，不按 0 算）：", e.unknown.join("、")]
			})
		]
	});
}
function fn({ f: e, look: t, onParent: n }) {
	let r = e.state ? Qt[e.state] : Qt.unclaimed, i = e.state !== "merged" && e.state !== "closed", a = /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("button", {
			type: "button",
			className: "br-link br-fam-up",
			title: `大需求 ${e.parent} 的需求看板`,
			onClick: n,
			children: e.parent
		}),
		" 的小需求",
		e.unit ? ` · 单元 ${e.unit}` : ""
	] });
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ g(rn, {
			look: t,
			title: a,
			children: [
				/* @__PURE__ */ g("span", {
					className: `kt-pill tone-${r.tone}`,
					"data-testid": "fam-state",
					children: [/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: r.glyph
					}), e.state_label]
				}),
				/* @__PURE__ */ g("span", {
					className: "br-fam-owner",
					children: [/* @__PURE__ */ h(Y, {
						role: "person",
						size: 14
					}), e.owner ? /* @__PURE__ */ h("b", { children: e.owner }) : /* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: "没人认领"
					})]
				}),
				e.parent_title && /* @__PURE__ */ g("span", {
					className: "kt-dim br-small",
					children: ["大需求：", e.parent_title]
				})
			]
		}),
		i && e.blocked_by.length > 0 && /* @__PURE__ */ g("div", {
			className: "kt-situation tone-warn br-fam-blockline",
			"data-testid": "fam-blocked",
			children: [/* @__PURE__ */ h("strong", { children: "挡着它：" }), /* @__PURE__ */ g("span", {
				className: "kt-summary",
				children: [
					e.blocked_by.join("、"),
					" 还没合进大需求的分支",
					e.branch ? /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ h("code", { children: e.branch })] }) : "",
					"。等它合并，或者在它的分支上先做。"
				]
			})]
		}),
		/* @__PURE__ */ g("dl", {
			className: "br-fam-facts",
			children: [
				/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "依赖" }), /* @__PURE__ */ h("dd", { children: e.depends_on.length ? /* @__PURE__ */ h(pn, { deps: e.depends_on }) : /* @__PURE__ */ h("span", {
					className: "kt-dim",
					children: "不依赖别的小需求"
				}) })] }),
				/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "路径" }), /* @__PURE__ */ h("dd", {
					className: "br-fam-chips",
					children: e.paths.length ? e.paths.map((e) => /* @__PURE__ */ h("code", { children: e }, e)) : /* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: "—"
					})
				})] }),
				/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "契约" }), /* @__PURE__ */ h("dd", {
					className: "br-fam-chips",
					children: e.contracts.length ? e.contracts.map((e) => /* @__PURE__ */ h("code", { children: e }, e)) : /* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: "没有"
					})
				})] }),
				e.branch && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "大需求的分支" }), /* @__PURE__ */ g("dd", { children: [/* @__PURE__ */ h("code", { children: e.branch }), /* @__PURE__ */ h("span", {
					className: "kt-dim br-small",
					children: "从这里开工，MR 合回这里"
				})] })] })
			]
		})
	] });
}
function pn({ deps: e }) {
	return /* @__PURE__ */ h("ul", {
		className: "br-fam-deplist",
		"aria-label": "依赖",
		children: e.map((e) => /* @__PURE__ */ g("li", {
			"data-testid": "fam-dep",
			"data-merged": e.merged ? "true" : "false",
			children: [/* @__PURE__ */ g("span", {
				className: `kt-pill tone-${e.merged ? "ok" : "warn"}`,
				children: [/* @__PURE__ */ h("i", {
					"aria-hidden": "true",
					children: e.merged ? "✔" : "⏸"
				}), e.merged ? "合进来了" : "还没合"]
			}), /* @__PURE__ */ h("span", { children: e.text || e.key })]
		}, e.key))
	});
}
function mn({ f: e, look: t, split: n, ctl: r }) {
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h(rn, {
			look: t,
			title: "大需求：还没拆成小需求",
			children: e.family_label && /* @__PURE__ */ h("span", {
				className: "kt-pill tone-info",
				children: e.family_label
			})
		}),
		/* @__PURE__ */ g("p", {
			className: "br-fam-next",
			"data-testid": "fam-next",
			children: [/* @__PURE__ */ h(Y, {
				role: "scope",
				size: 16
			}), /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("b", { children: "下一步：" }), Zt] })]
		}),
		n && !r.splitOpen && /* @__PURE__ */ h("div", {
			className: "br-fam-acts",
			children: /* @__PURE__ */ h("div", {
				className: "br-fam-actrow",
				children: /* @__PURE__ */ h(hn, {
					act: n,
					ctl: r
				})
			})
		})
	] });
}
function hn({ act: e, ctl: t, hint: n, primary: r = !0 }) {
	return /* @__PURE__ */ h(gn, {
		act: e,
		label: Q.split,
		icon: "scope",
		primary: r,
		busy: t.busy,
		pending: t.preview.busy ? "正在看…" : void 0,
		onClick: () => void t.openSplit(),
		hint: n ?? "先看会拆成什么，什么都不写"
	});
}
function gn({ act: e, label: t, icon: n, primary: r = !1, danger: i = !1, busy: o = !1, pending: s, onClick: c, hint: l }) {
	let u = a();
	if (!e) return null;
	let d = !e.ok && e.why;
	return /* @__PURE__ */ g("span", {
		className: "br-fam-act",
		children: [/* @__PURE__ */ g("button", {
			type: "button",
			className: `kt-btn${r && e.ok ? " is-primary" : ""}${i ? " is-danger" : ""}`,
			disabled: !e.ok || o,
			"aria-describedby": d ? u : void 0,
			onClick: c,
			children: [n && /* @__PURE__ */ h(Y, {
				role: n,
				size: 15
			}), s ?? t]
		}), d ? /* @__PURE__ */ g("span", {
			className: "br-fam-why",
			id: u,
			children: [/* @__PURE__ */ h("i", {
				"aria-hidden": "true",
				children: "✋"
			}), e.why]
		}) : l ? /* @__PURE__ */ h("span", {
			className: "kt-dim br-small",
			children: l
		}) : null]
	});
}
var _n = {
	ok: !0,
	why: ""
};
function vn({ f: e, ctl: t, reqKey: n, onBoard: r }) {
	let i = e.acts, a = f();
	if (!i.claim && !i.release && !i.start && !i.start_on && !i.sync && !t.last) return null;
	let o = t.busy, s = (e, n) => t.last === e && o ? n : void 0, c = !!(i.start || i.start_on);
	return /* @__PURE__ */ g("div", {
		className: "br-fam-acts",
		role: "group",
		"aria-label": "小需求的操作",
		children: [
			/* @__PURE__ */ g("div", {
				className: "br-fam-actrow",
				children: [
					/* @__PURE__ */ h(gn, {
						act: i.claim,
						label: Q.claim,
						icon: "person",
						primary: !0,
						busy: o,
						pending: s("claim", "正在认领…"),
						onClick: () => void t.doClaim(),
						hint: "先推上去的算"
					}),
					/* @__PURE__ */ h(gn, {
						act: i.start,
						label: Q.start,
						icon: "deploy",
						primary: !i.claim,
						busy: o,
						pending: s("start", "正在开工…"),
						onClick: () => void t.doStart(),
						hint: "从大需求的分支开，放在它自己的工作目录"
					}),
					i.start_on && /* @__PURE__ */ h(gn, {
						act: _n,
						label: Me(i.start_on),
						icon: "merge",
						busy: o,
						onClick: () => void t.doStart(i.start_on),
						hint: `${i.start_on} 合并之前，你的 MR 里也带着它的提交`
					}),
					/* @__PURE__ */ h(gn, {
						act: i.sync,
						label: Q.sync,
						icon: "merge",
						busy: o,
						pending: s("sync", "正在同步…"),
						onClick: () => void t.doSync(),
						hint: "把大需求的分支合进来"
					}),
					i.release && !t.asking && /* @__PURE__ */ h(gn, {
						act: i.release,
						label: Q.release,
						danger: !0,
						busy: o,
						pending: s("release", "正在放回…"),
						onClick: () => t.setAsking(!0)
					})
				]
			}),
			i.release && t.asking && /* @__PURE__ */ g("div", {
				className: "br-confirm is-danger",
				role: "group",
				"aria-label": `确认${Q.release}`,
				children: [/* @__PURE__ */ g("p", { children: [
					"放回去以后，",
					n,
					" 又是",
					Ne.unclaimed,
					"，谁都能",
					Q.claim,
					"。"
				] }), /* @__PURE__ */ g("div", {
					className: "br-row",
					children: [/* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn is-danger is-solid",
						disabled: o,
						onClick: () => void t.doRelease(),
						children: "确定放弃"
					}), /* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn",
						onClick: () => t.setAsking(!1),
						children: "取消"
					})]
				})]
			}),
			c && /* @__PURE__ */ g("label", {
				className: "br-check br-small",
				children: [/* @__PURE__ */ h("input", {
					type: "checkbox",
					checked: t.trust,
					onChange: (e) => t.setTrust(e.target.checked)
				}), /* @__PURE__ */ h("span", { children: "开工后这个会话的工具调用不用逐个批准" })]
			}),
			(t.last === "claim" || t.last === "release") && t.claim.result && /* @__PURE__ */ h(Cn, { r: t.claim.result }),
			t.last === "start" && t.start.result && /* @__PURE__ */ h(wn, {
				r: t.start.result,
				onOpen: a,
				onBoard: r,
				onOn: i.start_on ? void 0 : (e) => void t.doStart(e),
				busy: o
			}),
			t.last === "sync" && t.sync.result && /* @__PURE__ */ h(Tn, { r: t.sync.result }),
			t.last && /* @__PURE__ */ h(yn, { text: t.last === "start" ? t.start.error : t.last === "sync" ? t.sync.error : t.claim.error })
		]
	});
}
function yn({ text: e }) {
	return e ? /* @__PURE__ */ h("p", {
		className: "br-error",
		role: "alert",
		children: e
	}) : null;
}
function bn({ text: e, what: t, open: n = !1 }) {
	return e ? /* @__PURE__ */ g("details", {
		className: "br-raw br-fam-raw",
		open: n,
		children: [/* @__PURE__ */ g("summary", { children: [
			"细节：",
			t,
			"时 brain-kit 的原话"
		] }), /* @__PURE__ */ h("pre", { children: e })]
	}) : null;
}
var xn = (e) => !!e.problem && e.problem.text === e.text;
function Sn({ ok: e, text: t, glyph: n }) {
	return /* @__PURE__ */ g("p", {
		className: "br-fam-verdict",
		role: "status",
		children: [/* @__PURE__ */ h("i", {
			"aria-hidden": "true",
			children: n ?? (e ? "✓" : "✕")
		}), /* @__PURE__ */ h("b", { children: t })]
	});
}
function Cn({ r: e }) {
	return /* @__PURE__ */ g("div", {
		className: `br-fam-out ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "fam-claim-result",
		children: [
			!xn(e) && /* @__PURE__ */ h(Sn, {
				ok: e.ok,
				text: e.text || (e.ok ? "好了" : "没成")
			}),
			!e.ok && e.owner && !e.text.includes(e.owner) && /* @__PURE__ */ g("p", {
				className: "br-small",
				children: [
					"现在在 ",
					/* @__PURE__ */ h("b", { children: e.owner }),
					" 手里。"
				]
			}),
			e.problem && /* @__PURE__ */ h(xt, { rows: [e.problem] }),
			/* @__PURE__ */ h(bn, {
				text: e.output,
				what: Q.claim,
				open: !e.ok && !e.problem && !e.text
			})
		]
	});
}
function wn({ r: e, onOpen: t, onBoard: n, onOn: r, busy: i = !1 }) {
	return /* @__PURE__ */ g("div", {
		className: `br-fam-out ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "fam-start-result",
		children: [
			!xn(e) && /* @__PURE__ */ h(Sn, {
				ok: e.ok,
				text: e.text || (e.ok ? `开工了：${e.key}` : "没开成")
			}),
			e.ok && /* @__PURE__ */ g("dl", {
				className: "br-fam-facts",
				children: [
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "分支" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("code", { children: e.branch ?? "—" }) })] }),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "工作目录" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("code", { children: e.worktree ?? "—" }) })] }),
					e.on && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "先做在" }), /* @__PURE__ */ g("dd", { children: [/* @__PURE__ */ h("code", { children: e.on }), /* @__PURE__ */ h("span", {
						className: "kt-dim br-small",
						children: "的分支上：它合并之前，你的 MR 里也带着它的提交"
					})] })] })
				]
			}),
			e.blocked.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-stack",
				style: { gap: 4 },
				children: [/* @__PURE__ */ h("b", {
					className: "br-small",
					children: "还没合进大需求的分支："
				}), /* @__PURE__ */ h(pn, { deps: e.blocked })]
			}),
			!e.ok && e.can_on && r && /* @__PURE__ */ g("span", {
				className: "br-fam-act",
				children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn",
					disabled: i,
					onClick: () => r(e.can_on),
					children: [/* @__PURE__ */ h(Y, {
						role: "merge",
						size: 15
					}), Me(e.can_on)]
				}), /* @__PURE__ */ h("span", {
					className: "kt-dim br-small",
					children: "或者等它合并"
				})]
			}),
			e.problem && /* @__PURE__ */ h(xt, { rows: [e.problem] }),
			(e.url || e.ok && n) && /* @__PURE__ */ g("div", {
				className: "br-row",
				children: [e.url && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: () => t(e.url),
					children: [/* @__PURE__ */ h(Y, {
						role: "laptop",
						size: 16
					}), Z.openSession]
				}), e.ok && n && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => n(e.key),
					children: [/* @__PURE__ */ h(Y, {
						role: "runner",
						size: 16
					}), Z.openBoard]
				})]
			}),
			e.ok && !e.url && e.session_error && /* @__PURE__ */ g("p", {
				className: "br-error br-pre",
				role: "alert",
				children: ["会话没开成：", e.session_error]
			}),
			/* @__PURE__ */ h(bn, {
				text: e.output,
				what: Q.start,
				open: !e.ok && !e.problem && e.blocked.length === 0
			})
		]
	});
}
function Tn({ r: e }) {
	let t = e.result === "merged" || e.result === "up_to_date";
	return /* @__PURE__ */ g("div", {
		className: `br-fam-out ${t ? "is-ok" : e.result === "conflicts" ? "is-warn" : "is-bad"}`,
		"data-testid": "fam-sync-result",
		"data-result": e.result,
		children: [
			!xn(e) && /* @__PURE__ */ h(Sn, {
				ok: t,
				text: e.text || Pe[e.result],
				glyph: e.result === "conflicts" ? "!" : void 0
			}),
			e.conflicts.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-fam-conflicts",
				"data-testid": "fam-conflicts",
				children: [
					/* @__PURE__ */ h("b", {
						className: "br-small",
						children: "这些文件有冲突，留给你："
					}),
					/* @__PURE__ */ h("ul", {
						className: "br-fam-chips",
						children: e.conflicts.map((e) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h("code", { children: e }) }, e))
					}),
					/* @__PURE__ */ g("p", {
						className: "br-prob-todo br-small",
						children: [
							/* @__PURE__ */ h("b", { children: "做什么" }),
							"在这个小需求的工作目录里改好这些文件，git add、git commit，再点一次「",
							Q.sync,
							"」。"
						]
					})
				]
			}),
			e.problem && /* @__PURE__ */ h(xt, { rows: [e.problem] }),
			/* @__PURE__ */ h(bn, {
				text: e.output,
				what: Q.sync,
				open: e.result === "refused" && !e.problem && !e.text
			})
		]
	});
}
function En({ ctl: e }) {
	let t = e.preview.result, n = e.apply.result, r = n ?? t;
	return /* @__PURE__ */ g("div", {
		className: "br-fam-split",
		"data-testid": "split-box",
		children: [
			e.preview.busy && !t && /* @__PURE__ */ h("p", {
				className: "br-loading",
				children: "正在看会拆成什么（只是看，什么都不写）…"
			}),
			r && /* @__PURE__ */ h(Dn, { r }),
			n?.ok ? /* @__PURE__ */ h("div", {
				className: "br-row",
				children: /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: e.closeSplit,
					children: "收起"
				})
			}) : t && /* @__PURE__ */ g("div", {
				className: "br-fam-confirm",
				children: [t.ok && !n ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					disabled: e.busy,
					onClick: () => void e.applySplit(),
					children: [/* @__PURE__ */ h(Y, {
						role: "scope",
						size: 15
					}), e.apply.busy ? "正在拆…" : Q.splitConfirm]
				}), /* @__PURE__ */ g("span", {
					className: "kt-dim br-small",
					children: [
						"确定以后：推送大需求的分支，每个单元登记一个小需求（",
						Ne.unclaimed,
						"）。"
					]
				})] }) : /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					disabled: e.busy,
					onClick: () => void e.openSplit(),
					children: e.preview.busy ? "正在看…" : "再看一次"
				}), /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					disabled: e.busy,
					onClick: e.closeSplit,
					children: "取消"
				})]
			}),
			!t && !e.preview.busy && e.preview.error && /* @__PURE__ */ h("div", {
				className: "br-row",
				children: /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: e.closeSplit,
					children: "取消"
				})
			}),
			/* @__PURE__ */ h(yn, { text: e.apply.error || e.preview.error })
		]
	});
}
function Dn({ r: e }) {
	let t = e.ok ? e.dry_run ? "先看一眼：会这样拆（还什么都没写）" : "拆好了" : "拆不了";
	return /* @__PURE__ */ g("div", {
		className: `br-fam-out ${e.ok ? e.dry_run ? "is-plan" : "is-ok" : "is-bad"}`,
		"data-testid": e.dry_run ? "split-preview" : "split-result",
		children: [
			/* @__PURE__ */ h(Sn, {
				ok: e.ok,
				text: t,
				glyph: e.ok && e.dry_run ? "?" : void 0
			}),
			e.text && /* @__PURE__ */ h("p", {
				className: "br-pre",
				children: e.text
			}),
			(e.units_sha || e.design_sha || e.branch) && /* @__PURE__ */ g("p", {
				className: "kt-dim br-small br-fam-shas",
				children: [
					e.units_sha && /* @__PURE__ */ g(m, { children: ["unit-of-work.md ", /* @__PURE__ */ h("code", { children: e.units_sha })] }),
					e.design_sha && /* @__PURE__ */ g(m, { children: [
						" · ",
						Oe.DESIGN,
						" ",
						/* @__PURE__ */ h("code", { children: e.design_sha }),
						" 批过"
					] }),
					e.branch && /* @__PURE__ */ g(m, { children: [" · 大需求的分支 ", /* @__PURE__ */ h("code", { children: e.branch })] })
				]
			}),
			e.actions.length > 0 && /* @__PURE__ */ h(On, { r: e }),
			e.warnings.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-stack",
				style: { gap: 4 },
				"aria-label": "提醒",
				children: [/* @__PURE__ */ h("b", {
					className: "br-small",
					children: "提醒"
				}), /* @__PURE__ */ h(xt, { rows: e.warnings })]
			}),
			e.problems.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-stack",
				style: { gap: 4 },
				"aria-label": "为什么拆不了",
				children: [/* @__PURE__ */ h("b", {
					className: "br-small",
					children: "为什么拆不了"
				}), /* @__PURE__ */ h(xt, { rows: e.problems })]
			}),
			/* @__PURE__ */ h(bn, {
				text: e.output,
				what: e.dry_run ? "看拆法" : Q.split
			})
		]
	});
}
function On({ r: e }) {
	return /* @__PURE__ */ h("div", {
		className: "br-scroll",
		children: /* @__PURE__ */ g("table", {
			className: "cto-table br-fam-table",
			"aria-label": e.dry_run ? "会拆成这些小需求" : "拆成了这些小需求",
			children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
				/* @__PURE__ */ h("th", { children: "单元" }),
				/* @__PURE__ */ h("th", { children: "需求号" }),
				/* @__PURE__ */ h("th", { children: "怎么办" }),
				/* @__PURE__ */ h("th", { children: "路径" }),
				/* @__PURE__ */ h("th", { children: "依赖" }),
				/* @__PURE__ */ h("th", { children: "契约" })
			] }) }), /* @__PURE__ */ h("tbody", { children: e.actions.map((e, t) => /* @__PURE__ */ h(kn, { a: e }, `${e.unit}-${t}`)) })]
		})
	});
}
function kn({ a: e }) {
	let t = (e, t = "—") => e.length ? /* @__PURE__ */ h("span", {
		className: "br-fam-chips",
		children: e.map((e) => /* @__PURE__ */ h("code", { children: e }, e))
	}) : /* @__PURE__ */ h("span", {
		className: "kt-dim",
		children: t
	});
	return /* @__PURE__ */ g("tr", {
		className: e.attention ? "is-attention" : void 0,
		"data-testid": "split-row",
		"data-kind": e.kind,
		"data-attention": e.attention ? "true" : void 0,
		children: [
			/* @__PURE__ */ g("td", { children: [/* @__PURE__ */ h("b", {
				className: "br-mono",
				children: e.unit
			}), e.title && /* @__PURE__ */ h("div", {
				className: "kt-dim br-small",
				children: e.title
			})] }),
			/* @__PURE__ */ h("td", { children: e.key ? /* @__PURE__ */ h("code", {
				className: "br-key",
				children: e.key
			}) : /* @__PURE__ */ h("span", {
				className: "kt-pill tone-ok",
				children: "新号"
			}) }),
			/* @__PURE__ */ g("td", { children: [
				/* @__PURE__ */ g("span", {
					className: `kt-pill tone-${en[e.kind] ?? "idle"}`,
					children: [e.attention && /* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: "!"
					}), e.kind_label || e.kind]
				}),
				e.attention && /* @__PURE__ */ h("div", {
					className: "br-fam-attn",
					children: "要和认领的人说一声"
				}),
				e.why.map((e, t) => /* @__PURE__ */ h("div", {
					className: "br-small",
					children: e
				}, t))
			] }),
			/* @__PURE__ */ h("td", { children: t(e.paths) }),
			/* @__PURE__ */ h("td", { children: t(e.depends_on, "不依赖") }),
			/* @__PURE__ */ h("td", { children: t(e.contracts) })
		]
	});
}
var An = "\n.br-fam { display: grid; gap: 12px; min-width: 0; align-content: start; }\n.br-fam .br-fam-head { margin-bottom: 0; align-items: center; gap: 6px 10px; }\n.br-fam-head-acts { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.br-fam-up { font: inherit; font-family: var(--mono, ui-monospace, monospace); font-weight: 800; }\n.br-fam-owner { display: inline-flex; align-items: center; gap: 5px; margin: 0; font-size: .9em; color: var(--text); }\n.br-fam-owner .kt-role-icon { color: var(--muted); }\n.br-fam-owner b { color: var(--text-strong); font-weight: 750; }\n.br-fam-local { margin: 0; }\n\n/* the roll-up: 已合并 n/m with one cell per small one, then the counts */\n.br-fam-sum { display: grid; grid-template-columns: minmax(170px, 230px) minmax(0, 1fr); gap: 10px 22px; align-items: center; }\n@media (max-width: 760px) { .br-fam-sum { grid-template-columns: minmax(0, 1fr); } }\n.br-fam-merged { display: grid; gap: 2px; }\n.br-fam-merged .kt-kpi-big.tone-ok { color: var(--kt-ok); }\n.br-fam .kt-segs i.is-claimed { background: var(--kt-queue); }\n.br-fam .kt-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }\n.br-fam-counts { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }\n@media (max-width: 760px) { .br-fam-counts { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-fam-counts li { display: flex; align-items: baseline; gap: 7px; padding: 9px 12px; border-radius: var(--kit-r-cell, 10px);\n  border: 1px solid color-mix(in srgb, var(--kt-tone) 38%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 7%, transparent); }\n.br-fam-counts b { font-size: 1.65em; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--text-strong); }\n.br-fam-counts small { color: var(--muted); font-weight: 700; font-size: .9em; }\n.br-fam-counts li.is-zero { border-style: dashed; background: transparent; border-color: var(--border); }\n.br-fam-counts li.is-zero b { color: var(--muted); }\n\n/* the small ones as lanes (the board's lane look, without a time track) */\n.br-fam-lanes { display: flex; flex-direction: column; gap: 8px; min-width: 0; }\n.br-fam-lane { grid-template-columns: 220px minmax(0, 1.3fr) minmax(0, 1fr); grid-template-areas: \"id live work\"; cursor: pointer; padding: 10px 14px 10px 18px; }\n.br-fam-lane:hover { border-color: color-mix(in srgb, var(--accent) 70%, var(--border)); }\n.br-fam-lane .kt-avatar { width: 46px; height: 46px; border-radius: 14px; cursor: pointer; color: var(--text-strong); }\n.br-fam-lane .kt-lane-id { grid-template-columns: 46px minmax(0, 1fr); }\n.br-fam-lane.is-unclaimed { border-style: dashed; background: color-mix(in srgb, var(--card) 70%, transparent); }\n.br-fam-lane.is-unclaimed .kt-avatar { border-style: dashed; color: var(--muted); }\n.br-fam-lane.is-in_progress { border-color: color-mix(in srgb, var(--kt-run) 45%, var(--border));\n  background: linear-gradient(100deg, color-mix(in srgb, var(--kt-run) 7%, var(--card)), var(--card) 45%); }\n.br-fam-lane.is-merged .kt-avatar { color: #fff; }\n.br-fam-lane.is-closed { opacity: .55; }\n.br-fam-key { appearance: none; border: 0; background: none; padding: 0; font: inherit; font-family: var(--mono, ui-monospace, monospace); color: var(--text-strong); cursor: pointer; }\n.br-fam-key:hover { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }\n.br-fam-title { color: var(--text-strong); font-weight: 650; overflow-wrap: anywhere; }\n.br-fam-deps { display: flex; flex-wrap: wrap; align-items: center; gap: 5px; font-size: .92em; }\n.br-fam-lane .kt-lane-work { justify-content: center; }\n.br-fam-lanenums b { color: var(--text-strong); font-weight: 750; margin: 0 1px; }\n@media (max-width: 900px) { .br-fam-lane { grid-template-columns: minmax(0, 1fr); grid-template-areas: \"id\" \"live\" \"work\"; } }\n\n/* the trace roll-up */\n.br-fam-roll { display: grid; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }\n.br-fam-roll-head { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }\n.br-fam-roll-head b { color: var(--text-strong); }\n.br-fam-nums { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }\n@media (max-width: 900px) { .br-fam-nums { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.br-fam-num { display: grid; gap: 1px; align-content: start; padding: 10px 12px; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--kt-glass); }\n.br-fam-num small { color: var(--muted); font-weight: 700; font-size: .86em; }\n.br-fam-num b { font-size: 1.7em; font-weight: 800; letter-spacing: -.02em; line-height: 1.15; font-variant-numeric: tabular-nums; color: var(--text-strong); }\n.br-fam-num span { font-size: .84em; color: var(--text); }\n.br-fam-num.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.br-fam-unknown { margin: 0; color: var(--kt-warn); font-weight: 650; }\n\n/* a small one: its facts */\n.br-fam-facts { display: grid; gap: 6px; margin: 0; }\n.br-fam-facts > div { display: grid; grid-template-columns: 7em minmax(0, 1fr); gap: 4px 12px; align-items: baseline; min-width: 0; }\n.br-fam-facts dt { color: var(--muted); font-size: .9em; }\n.br-fam-facts dd { margin: 0; min-width: 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; overflow-wrap: anywhere; }\n.br-fam-chips { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 4px; }\n.br-fam-chips code { padding: 1px 7px; border-radius: 6px; font-size: .86em; border: 1px solid var(--border); background: var(--kt-glass); overflow-wrap: anywhere; }\n.br-fam-deplist { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }\n.br-fam-deplist li { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }\n.br-fam-blockline { margin: 0; }\n.br-fam-next { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 10px 12px; border-radius: 10px; color: var(--text);\n  border: 1px dashed color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 6%, transparent); }\n.br-fam-next .kt-role-icon { flex: none; margin-top: 2px; color: var(--kt-info); }\n.br-fam-next b { color: var(--text-strong); }\n\n/* the actions and their answers */\n.br-fam-acts { display: grid; gap: 10px; padding-top: 12px; border-top: 1px solid var(--border); }\n.br-fam-actrow { display: flex; flex-wrap: wrap; gap: 10px 18px; align-items: center; }\n.br-fam-act { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }\n.br-fam .kt-btn { display: inline-flex; align-items: center; gap: 6px; }\n.br-fam .kt-btn:disabled { cursor: not-allowed; opacity: .55; }\n.br-fam-why { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 999px; font-size: .88em; font-weight: 650; white-space: normal;\n  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 10%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 40%, transparent); }\n.br-fam-why i { font-style: normal; }\n.br-fam-out { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); min-width: 0; }\n.br-fam-out.is-ok { border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 7%, var(--card)); }\n.br-fam-out.is-bad { border-color: var(--kit-bad); background: color-mix(in srgb, var(--kt-bad) 7%, var(--card)); }\n.br-fam-out.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 7%, var(--card)); }\n.br-fam-out.is-plan { border-color: color-mix(in srgb, var(--accent) 55%, var(--border)); background: color-mix(in srgb, var(--accent) 6%, var(--card)); }\n.br-fam-out p { margin: 0; }\n.br-fam-verdict { display: flex; align-items: center; gap: 8px; color: var(--text-strong); }\n.br-fam-verdict b { font-weight: 800; }\n.br-fam-verdict i { font-style: normal; flex: none; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font-size: .8em; font-weight: 900;\n  color: #fff; background: var(--kt-ok-solid); }\n.br-fam-out.is-bad .br-fam-verdict i { background: var(--kt-bad-solid); }\n.br-fam-out.is-warn .br-fam-verdict i { background: var(--kt-warn); color: var(--kt-on); }\n.br-fam-out.is-plan .br-fam-verdict i { background: var(--accent); color: var(--accent-fg, #fff); }\n.br-fam-conflicts { display: grid; gap: 6px; }\n.br-fam-shas code { color: var(--text); }\n.br-fam-split { display: grid; gap: 10px; }\n.br-fam-confirm { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }\n.br-fam-table td { vertical-align: top; }\n.br-fam-table tr.is-attention td { background: color-mix(in srgb, var(--kt-warn) 8%, transparent); }\n.br-fam-table tr.is-attention td:first-child { box-shadow: inset 3px 0 0 var(--kt-warn); }\n.br-fam-attn { margin-top: 4px; color: var(--kt-warn); font-weight: 750; font-size: .86em; }\n.br-fam-raw pre { max-height: 16em; overflow: auto; }\n", jn = {
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
function Mn(e) {
	return jn[e] ?? {
		label: String(e),
		tone: "idle",
		icon: "•",
		hint: ""
	};
}
var Nn = (e) => e === "merged" || e === "skipped", Pn = /* @__PURE__ */ new Set(["running", "fixing"]), Fn = /* @__PURE__ */ new Set([
	"running",
	"fixing",
	"stalled",
	"awaiting_approval"
]), In = {
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
		label: "批准的那一行没被接受",
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
		label: "自动检查",
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
}, Ln = {
	branch: "运行分支",
	checks: "检查"
}, Rn = /* @__PURE__ */ new Set([
	"approve",
	"reject",
	"request",
	"question",
	"answer"
]);
function zn(e, t) {
	let n = t.events.find((e) => e.kind === "handover")?.at;
	return e.from === "bridge" || e.to === "bridge" || Rn.has(e.kind) && n !== void 0 && e.at > n ? e.to === "release" || e.from === "release" || /验收/.test(e.text) ? "产品" : "MR" : t.person.me ? "你" : t.person.owner ?? "负责人";
}
function Bn(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 60) return `${t} 秒`;
	let n = Math.round(t / 60);
	if (n < 60) return `${n} 分钟`;
	let r = Math.floor(n / 60);
	if (r < 24) return n % 60 ? `${r} 小时 ${n % 60} 分` : `${r} 小时`;
	let i = Math.floor(r / 24);
	return r % 24 ? `${i} 天 ${r % 24} 小时` : `${i} 天`;
}
function Vn(e) {
	let t = Math.max(0, Math.round(e));
	if (t < 5) return "刚刚";
	if (t < 60) return `${t} 秒前`;
	let n = Math.floor(t / 60);
	if (n < 60) return `${n} 分钟前`;
	let r = Math.floor(n / 60);
	return r < 24 ? `${r} 小时前` : `${Math.floor(r / 24)} 天前`;
}
function Hn(e) {
	return e == null || !Number.isFinite(e) ? "—" : e >= 100 ? String(Math.round(e)) : (Math.round(e * 10) / 10).toFixed(1);
}
var Un = (e) => String(e).padStart(2, "0");
function Wn(e) {
	if (e == null || !Number.isFinite(e)) return "—";
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${Un(t.getMonth() + 1)}-${Un(t.getDate())} ${Un(t.getHours())}:${Un(t.getMinutes())}`;
}
function Gn(e) {
	let t = 0;
	for (let n of e) t += Kn(n);
	return t;
}
function Kn(e) {
	let t = e.codePointAt(0) ?? 0;
	return t === 32 ? .3 : t > 126976 ? 1.2 : t >= 11904 && t <= 40959 || t >= 65280 && t <= 65519 || t >= 12288 && t <= 12351 ? 1 : .58;
}
function qn(e, t) {
	if (Gn(e) <= t) return e;
	let n = "", r = 0;
	for (let i of e) {
		let e = Kn(i);
		if (r + e > t - .8) break;
		n += i, r += e;
	}
	return `${n.trimEnd()}…`;
}
function Jn(e, t) {
	return e.from === t || e.to === t;
}
var Yn = [
	{
		key: "gate",
		label: "Lean 审批"
	},
	{
		key: "verify",
		label: "自动检查"
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
], Xn = {
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
	},
	watch: {
		label: "观察中",
		glyph: "⏳"
	},
	not_needed: {
		label: "这次不需要",
		glyph: "–"
	}
};
function Zn(e, t, n = !1) {
	return e === "people" && t && !n ? `等 ${t}` : je(e) || "等人";
}
var Qn = (e, t = e.row.waits.who) => Zn(t, e.person.owner, e.person.me);
function $n(e, t, n = t.row.waits.who) {
	return e === "awaiting_approval" ? Qn(t, n) : Mn(e).label;
}
function er(e, t) {
	return [...e.history].reverse().find((e) => e.at <= t + 1 && e.status === "awaiting_approval")?.who ?? null;
}
function tr(e, t, n) {
	return n.b === null && e.status === "awaiting_approval" ? t.row.waits.who : er(e, n.a) ?? t.row.waits.who;
}
function nr(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e.actors) {
		n.status === "awaiting_approval" && !ar(e) && t.add(Qn(e));
		for (let r of n.spans) {
			let i = r.kind === "wait" ? tr(n, e, r) : "you";
			i !== "you" && t.add(Qn(e, i));
		}
	}
	return [...t];
}
var rr = /* @__PURE__ */ new Set([
	"you",
	"product",
	"people",
	"builder"
]), ir = (e) => e.person.you ?? (e.person.me || !e.person.owner), ar = (e) => e.row.waits.who === "you";
function or(e) {
	if (typeof e.row.local_only == "boolean") return e.row.local_only;
	let t = e.actors.filter((e) => sr.has(e.key));
	return e.direct || t.length > 0 && t.every((e) => e.status === "skipped");
}
var sr = /* @__PURE__ */ new Set([
	"handover",
	"bridge",
	"signer",
	"runner"
]), cr = (e) => e.row.where === "runner" && !e.row.worktree && ![
	"claimed",
	"merged",
	"closed"
].includes(e.row.state), lr = (e) => e.title && e.title !== e.key ? e.title : "", ur = (e) => ({
	...e,
	stage_state: e.started ? "started" : null
});
function dr(e) {
	if (typeof e.done_n == "number") {
		let t = e.next ?? null;
		return ur({
			done_n: e.done_n,
			skipped_n: e.skipped_n ?? 0,
			next: t,
			total: e.total,
			started: e.stage_state === "started" && !!t && (!e.stage || e.stage === t.id)
		});
	}
	let t = (e.stage_state === "started" || e.stage_state === "todo") && e.stage_label && e.stage_n !== null ? {
		id: e.stage ?? "",
		label: e.stage_label,
		n: e.stage_n
	} : null;
	return ur({
		done_n: e.done,
		skipped_n: 0,
		next: t,
		total: e.total,
		started: e.stage_state === "started"
	});
}
var fr = Object.entries(Ee);
function pr(e, t, n = 11) {
	let r = /* @__PURE__ */ new Map();
	for (let n of e) {
		if (n.kind !== "stage" || n.at > t) continue;
		let e = /^(开始|做完|跳过)「([^」（]+)(?:（([^）]*)）)?」/.exec(n.text);
		if (!e) continue;
		let i = r.get(e[2]) ?? /* @__PURE__ */ new Map();
		i.set(e[3] ?? "", e[1]), r.set(e[2], i);
	}
	let i = fr.map(([, e]) => {
		let t = [...r.get(e)?.values() ?? []];
		return t.length ? t.includes("开始") ? "started" : t.every((e) => e === "跳过") ? "skipped" : "done" : "todo";
	}), a = i.reduce((e, t, n) => t === "todo" ? e : n, -1), o = i.map((e, t) => e === "todo" && t < a ? "skipped" : e), s = o.lastIndexOf("started"), c = s >= 0 ? s : o.indexOf("todo"), l = c < 0 ? null : {
		id: fr[c][0],
		label: fr[c][1],
		n: c + 1
	};
	return ur({
		done_n: o.filter((e) => e === "done").length,
		skipped_n: o.filter((e) => e === "skipped").length,
		next: l,
		total: n,
		started: s >= 0
	});
}
function mr(e) {
	let t = e.cells.filter((e) => e.status === "watch").map((e) => e.name);
	return e.todo ? e.todo.filter((e) => !t.some((t) => t.startsWith(e))) : e.cells.filter((e) => e.status === "skip" && (e.group === "gate" || e.group === "verify")).map((e) => e.group === "gate" ? e.name.replace(/（[^）]*）$/, "") : e.label);
}
function hr(e, t) {
	let n = t.row.waits.who, r = (t) => e.cells.filter((e) => e.status === t).length, i = r("wait"), a = r("watch"), o = mr(e), s = o.length ? ` · 还剩 ${o.join("、")}` : "", c = a ? ` · ${a} 项在观察` : "";
	if (!e.total && !a) return {
		text: "还没有检查结果",
		tone: "idle",
		green: !1
	};
	if (e.failed) return {
		text: `${e.failed} 项没过${s}`,
		tone: "bad",
		green: !1
	};
	if (i) return {
		text: `${i} 项${rr.has(n) ? Qn(t) : "等人"}${s}`,
		tone: "approve",
		green: !1
	};
	let l = e.passed === 1 ? "1 项过了" : `${e.passed} 项都过`;
	return o.length ? {
		text: `目前 ${l}${s}${c}`,
		tone: "info",
		green: !1
	} : {
		text: `${e.passed === 1 ? "1 项过了" : `${e.passed} 项全过`}${c}`,
		tone: "ok",
		green: !a
	};
}
var gr = (e, t) => `${e}${/[A-Za-z0-9]$/.test(e) && /^[^\s，。：；、）]/.test(t) ? " " : ""}${t}`, _r = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\([^)\s]*\)/g, vr = /\/?[\w.~@+-]+(?:\/[\w.~@+-]*)+/g;
function yr(e) {
	let t = e.split("/").map((e, t) => t ? `/${e}` : e).filter((e, t) => e || t);
	return t.length > 1 && t[t.length - 1] === "/" && t.splice(-2, 2, `${t[t.length - 2]}/`), t;
}
function br({ path: e }) {
	return /* @__PURE__ */ h("span", {
		className: "br-path",
		children: yr(e).map((e, t) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("span", { children: e }), /* @__PURE__ */ h("wbr", {})] }, t))
	});
}
function xr({ text: e }) {
	if (!e) return null;
	let t = [], n = 0;
	for (let r of e.matchAll(vr)) r.index > n && t.push(e.slice(n, r.index)), t.push(/* @__PURE__ */ h(br, { path: r[0] }, r.index)), n = r.index + r[0].length;
	return n < e.length && t.push(e.slice(n)), /* @__PURE__ */ h(m, { children: t });
}
var Sr = (e) => (e.match(/`/g)?.length ?? 0) % 2 && /…$/.test(e) ? e.replace(/…$/, "`…") : e;
function Cr({ text: e }) {
	if (!e) return null;
	let t = Sr(e), n = [], r = 0;
	for (let e of t.matchAll(_r)) e.index > r && n.push(/* @__PURE__ */ h(xr, { text: t.slice(r, e.index) }, `t${e.index}`)), n.push(e[1] === void 0 ? e[2] === void 0 ? e[3] : /* @__PURE__ */ h("b", { children: /* @__PURE__ */ h(xr, { text: e[2] }) }, e.index) : /* @__PURE__ */ h("code", { children: /* @__PURE__ */ h(xr, { text: e[1] }) }, e.index)), r = e.index + e[0].length;
	return r < t.length && n.push(/* @__PURE__ */ h(xr, { text: t.slice(r) }, "end")), /* @__PURE__ */ h(m, { children: n });
}
var wr = /\s*（(D\d{2}#S\d{3}[^）]*)）/g;
function Tr(e) {
	return {
		text: e.replace(wr, ""),
		refs: [...e.matchAll(wr)].map((e) => e[1])
	};
}
var Er = (e) => e.trim().replace(/^\|/, "").replace(/\|$/, "").split(/(?<!\\)\|/).map((e) => e.trim().replace(/\\\|/g, "|")), Dr = (e) => /^\s*\|.*\|\s*$/.test(e), Or = (e) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(e), kr = /^\s*[-*+]\s+(.*)$/, Ar = /^\s*\d+[.)]\s+(.*)$/, jr = /^(#{1,6})\s+(.*)$/;
function Mr(e) {
	let t = e.replace(/\r\n?/g, "\n").split("\n"), n = [], r = 0;
	for (; r < t.length;) {
		let e = t[r];
		if (!e.trim()) {
			r++;
			continue;
		}
		if (/^\s*```/.test(e)) {
			let e = [];
			for (r++; r < t.length && !/^\s*```/.test(t[r]);) e.push(t[r++]);
			r++, n.push({
				kind: "code",
				text: e.join("\n")
			});
			continue;
		}
		let i = jr.exec(e);
		if (i) {
			n.push({
				kind: "h",
				level: i[1].length,
				text: i[2]
			}), r++;
			continue;
		}
		if (/^\s*(-{3,}|\*{3,})\s*$/.test(e)) {
			n.push({ kind: "hr" }), r++;
			continue;
		}
		if (Dr(e) && r + 1 < t.length && Or(t[r + 1])) {
			let i = Er(e), a = [];
			for (r += 2; r < t.length && Dr(t[r]);) a.push(Er(t[r++]));
			n.push({
				kind: "table",
				head: i,
				rows: a
			});
			continue;
		}
		for (let [i, a] of [[kr, "ul"], [Ar, "ol"]]) {
			if (!i.test(e)) continue;
			let o = [];
			for (; r < t.length && i.test(t[r]);) o.push(i.exec(t[r++])[1]);
			n.push({
				kind: a,
				items: o
			});
			break;
		}
		if (kr.test(e) || Ar.test(e)) continue;
		let a = [];
		for (; r < t.length && t[r].trim() && !jr.test(t[r]) && !kr.test(t[r]) && !Ar.test(t[r]) && !/^\s*```/.test(t[r]) && !(Dr(t[r]) && Or(t[r + 1] ?? ""));) a.push(t[r++]);
		n.push({
			kind: "p",
			lines: a
		});
	}
	return n;
}
function Nr({ text: e, testid: t, foldRefs: n = !1 }) {
	let r = [], i = n ? e.split("\n").map((e) => {
		let t = Tr(e);
		return r.push(...t.refs), t.text;
	}).join("\n") : e, a = [...new Set(r)];
	return /* @__PURE__ */ g("div", {
		className: "br-md",
		"data-testid": t,
		children: [Mr(i).map((e, t) => {
			switch (e.kind) {
				case "h": return e.level <= 2 ? /* @__PURE__ */ h("h4", { children: /* @__PURE__ */ h(Cr, { text: e.text }) }, t) : /* @__PURE__ */ h("h5", { children: /* @__PURE__ */ h(Cr, { text: e.text }) }, t);
				case "hr": return /* @__PURE__ */ h("hr", {}, t);
				case "code": return /* @__PURE__ */ h("pre", { children: /* @__PURE__ */ h("code", { children: e.text }) }, t);
				case "ul": return /* @__PURE__ */ h("ul", { children: e.items.map((e, t) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h(Cr, { text: e }) }, t)) }, t);
				case "ol": return /* @__PURE__ */ h("ol", { children: e.items.map((e, t) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h(Cr, { text: e }) }, t)) }, t);
				case "table": return /* @__PURE__ */ h("div", {
					className: "br-scroll",
					children: /* @__PURE__ */ g("table", {
						className: "cto-table",
						children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ h("tr", { children: e.head.map((e, t) => /* @__PURE__ */ h("th", { children: /* @__PURE__ */ h(Cr, { text: e }) }, t)) }) }), /* @__PURE__ */ h("tbody", { children: e.rows.map((t, n) => /* @__PURE__ */ h("tr", { children: e.head.map((e, n) => /* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(Cr, { text: t[n] ?? "" }) }, n)) }, n)) })]
					})
				}, t);
				default: return /* @__PURE__ */ h("p", { children: e.lines.map((e, t) => /* @__PURE__ */ g("span", { children: [t > 0 && /* @__PURE__ */ h("br", {}), /* @__PURE__ */ h(Cr, { text: e })] }, t)) }, t);
			}
		}), a.length > 0 && /* @__PURE__ */ g("p", {
			className: "br-hint",
			"data-testid": "md-refs",
			children: ["引用的材料段落：", a.join("、")]
		})]
	});
}
//#endregion
//#region src/views/Question.tsx
var Pr = {
	park: "本地会话",
	bridge: "运行机",
	mr: "MR"
};
function Fr({ id: e, repo: t, go: n }) {
	if (!I.test(e)) return /* @__PURE__ */ h("span", {
		className: "br-tag br-mono",
		children: e
	});
	let r = U(e);
	return /* @__PURE__ */ h("button", {
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
function Ir({ q: e, repo: t, reqKey: n, mrUrl: r, onAnswered: i, waiter: a = null }) {
	let o = st(e.state, e.source), s = ct(e), c = e.answerable_here && !e.lean_request, l = r === void 0 ? e.mr_url : r, u = e.source !== "park", d = e.lean_request ? `${ke(e.lean_request.split(" ")[0]) || "审批"}请求` : "", f = Tr(e.question), p = [
		...e.refs,
		...f.refs,
		...e.lean_request ? [e.lean_request] : [],
		...e.voucher_id ? [`凭证 ${e.voucher_id}`] : []
	], _ = u && s && !!a, v = e.kind === "acceptance", y = v ? "验收" : "回答";
	return /* @__PURE__ */ g("article", {
		className: `br-q${s ? " is-open" : ""}`,
		"aria-label": `问题 ${e.id ?? e.kind_label}`,
		"data-testid": "question",
		children: [
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [
					e.id && /* @__PURE__ */ h("b", {
						className: "br-key",
						children: e.id
					}),
					/* @__PURE__ */ h("span", {
						className: "br-tag",
						children: Pr[e.source] ?? e.source
					}),
					/* @__PURE__ */ h("span", {
						className: "br-chip tone-info",
						children: e.kind_label || e.kind
					}),
					/* @__PURE__ */ h("span", {
						className: `br-chip tone-${o.tone}`,
						children: o.label
					}),
					e.at !== null && /* @__PURE__ */ h("span", {
						className: "br-dim br-small",
						children: de(e.at)
					})
				]
			}),
			f.text ? /* @__PURE__ */ h("p", {
				className: "br-pre br-strong",
				children: /* @__PURE__ */ h(Cr, { text: f.text })
			}) : u && !e.lean_request && /* @__PURE__ */ g("p", {
				className: "br-dim br-small",
				"data-testid": "question-no-text",
				children: [
					"这个",
					e.kind_label || "",
					"问题的原话在 MR 上，运行机的记录里没有。"
				]
			}),
			e.options.length > 0 && !c && /* @__PURE__ */ h("ol", {
				className: "br-opts",
				"aria-label": "选项",
				children: e.options.map((t) => /* @__PURE__ */ g("li", { children: [
					/* @__PURE__ */ h("b", {
						className: "br-mono",
						children: t.id
					}),
					" ",
					/* @__PURE__ */ h(Cr, { text: t.text }),
					e.recommend === t.id && /* @__PURE__ */ h("span", {
						className: "br-chip tone-ok",
						style: { marginLeft: 6 },
						children: "推荐"
					})
				] }, t.id))
			}),
			e.recommend && !e.options.some((t) => t.id === e.recommend) && /* @__PURE__ */ g("p", {
				className: "br-note",
				children: ["推荐：", e.recommend]
			}),
			e.lean_request && /* @__PURE__ */ h("p", {
				className: "br-note",
				"data-testid": "lean-request",
				children: u ? /* @__PURE__ */ g(m, { children: [
					"这是 Lean 的",
					d,
					"：",
					gr(_ ? a ?? "" : "", `在 MR 上${y}${e.id ? ` ${e.id}` : ""}`),
					"（approve / reject），桥会把回答带回运行机。"
				] }) : /* @__PURE__ */ g(m, { children: [
					"这是 Lean 的",
					d,
					"：在会话里自己打批准那一行，这里不能回答。"
				] })
			}),
			e.answer && /* @__PURE__ */ g("p", {
				className: "br-pre",
				style: { margin: 0 },
				children: [
					"回答：",
					/* @__PURE__ */ h("b", {
						className: "br-strong",
						children: e.answer
					}),
					e.answerer ? ` · ${e.answerer}` : ""
				]
			}),
			l && /* @__PURE__ */ g("div", {
				className: "br-row br-small",
				children: [_ && !e.lean_request && /* @__PURE__ */ h("span", {
					className: "br-dim",
					children: gr(a ?? "", `在 MR 上${y}`)
				}), /* @__PURE__ */ h(dt, {
					href: l,
					children: s && !c && !_ ? v ? Z.acceptOnMr : Z.answerOnMr : Z.viewMr
				})]
			}),
			p.length > 0 && /* @__PURE__ */ g("details", {
				className: "br-raw",
				"data-testid": "question-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("div", {
					className: "br-row",
					style: {
						gap: 4,
						marginTop: 4
					},
					children: p.map((e) => /* @__PURE__ */ h("code", { children: e }, e))
				})]
			}),
			/* @__PURE__ */ h(jt, {
				question: e,
				repo: t,
				reqKey: n,
				onDone: () => i?.()
			})
		]
	});
}
function Lr(e) {
	let t = e.path ?? "MR.md";
	return e.source === "file" ? {
		text: "分支上写好的变更说明",
		title: `${t} · 提交 ${e.ref ?? "?"}`
	} : e.source === "records" ? {
		text: "分支上还没写好，这份是从记录生成的",
		title: `提交 ${e.ref ?? "?"} · 分支上没有 ${t}`
	} : {
		text: "",
		title: ""
	};
}
function Rr(e) {
	let [t, n] = c("");
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
function zr({ m: e, bare: t = !1 }) {
	let { copied: n, copy: r } = Rr(e.text), i = Lr(e), a = Tr(e.first ?? ""), o = /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ g("header", {
			className: "br-row",
			children: [
				/* @__PURE__ */ h("h3", { children: "变更说明" }),
				i.text && /* @__PURE__ */ h("span", {
					className: "br-dim br-small",
					title: i.title,
					"data-testid": "mr-desc-from",
					children: i.text
				}),
				/* @__PURE__ */ h("span", { className: "br-grow" }),
				e.text && /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => void r(),
					children: [/* @__PURE__ */ h($, {
						name: "Copy",
						size: 13
					}), "复制"]
				})
			]
		}),
		e.error && /* @__PURE__ */ h("p", {
			className: "br-note",
			children: e.error
		}),
		a.text && /* @__PURE__ */ h("p", {
			className: "br-strong br-mrfirst",
			style: { margin: 0 },
			"data-testid": "mr-desc-first",
			title: a.refs.length ? `出处 ${a.refs.join("、")}` : void 0,
			children: /* @__PURE__ */ h(Cr, { text: a.text })
		}),
		e.text && /* @__PURE__ */ g("details", {
			className: "br-raw br-mdfold",
			children: [/* @__PURE__ */ h("summary", { children: "看全文" }), /* @__PURE__ */ h(Nr, {
				text: e.text,
				testid: "mr-desc-text",
				foldRefs: !0
			})]
		}),
		n === "ok" && /* @__PURE__ */ h("span", {
			className: "br-small br-ok-text",
			role: "status",
			children: "已复制"
		}),
		n === "fail" && /* @__PURE__ */ h("span", {
			className: "br-small br-bad-text",
			role: "status",
			children: "没复制成：请展开全文手动选中"
		}),
		e.text && /* @__PURE__ */ h("p", {
			className: "br-hint",
			children: "复制的是 brain-kit 处理过的文字：贴进 GitLab 的 MR 描述里，@ 提到人、HTML、图片、快捷命令、像批准或回答的行都不会生效。"
		})
	] });
	return t ? /* @__PURE__ */ h("div", {
		className: "br-stack",
		style: { gap: 8 },
		"aria-label": "变更说明",
		"data-testid": "mr-desc",
		children: o
	}) : /* @__PURE__ */ h("section", {
		className: "br-card",
		"aria-label": "变更说明",
		"data-testid": "mr-desc",
		children: o
	});
}
function Br({ say: e }) {
	let t = Rr(e);
	return /* @__PURE__ */ g("details", {
		className: "br-raw",
		"data-testid": "review-say",
		children: [/* @__PURE__ */ g("summary", { children: [
			"细节：",
			Z.review,
			"对新会话说的那一句"
		] }), /* @__PURE__ */ g("div", {
			className: "br-now-say",
			children: [
				/* @__PURE__ */ h("code", { children: /* @__PURE__ */ h(xr, { text: e }) }),
				/* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-small",
					onClick: () => void t.copy(),
					children: [/* @__PURE__ */ h($, {
						name: "Copy",
						size: 13
					}), "复制那一句"]
				}),
				t.copied === "ok" && /* @__PURE__ */ h("span", {
					className: "br-small br-ok-text",
					role: "status",
					children: "已复制"
				}),
				t.copied === "fail" && /* @__PURE__ */ h("span", {
					className: "br-small br-bad-text",
					role: "status",
					children: "没复制成：请手动选中"
				})
			]
		})]
	});
}
function Vr({ repo: e, reqKey: t, liveSlot: n, worktree: r }) {
	let i = u(), a = f(), [o, s] = c(!1), l = P((n) => i.post(E.session(e, t), n)), d = async () => {
		let e = await l.run({
			trust: !0,
			kickoff: !0,
			review: !0
		});
		e && (n && e.slot === n ? s(!0) : a(e.url));
	};
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ g("button", {
			type: "button",
			className: "kt-btn is-primary",
			disabled: l.busy,
			onClick: () => void d(),
			children: [/* @__PURE__ */ h($, {
				name: "MessageSquare",
				size: 13
			}), l.busy ? "正在开…" : Z.review]
		}),
		o && /* @__PURE__ */ g("p", {
			className: "br-note",
			role: "status",
			children: [
				"没开成新的审查会话：app 只找到了原来那个会话。在 KiroCrew 里新开一个 brain-dev 会话",
				r ? `（工作目录 ${r}）` : "",
				"，让它审查这个需求的代码。"
			]
		}),
		l.error && /* @__PURE__ */ h("p", {
			className: "br-error",
			role: "alert",
			children: l.error
		})
	] });
}
//#endregion
//#region src/views/ReqSwitch.tsx
var Hr = 3e4, Ur = "", Wr = (e, t) => `${e}${Ur}${t}`;
function Gr(e) {
	return `${e.key}${e.title && e.title !== e.key ? ` ${e.title}` : ""}${e.state_label ? ` · ${e.state_label}` : ""}${e.waits.who === "you" ? " · 等你" : ""}`;
}
function Kr(e, t) {
	return `${e}（${t}${/[\x21-\x7e]$/.test(t) ? " " : ""}里没有）`;
}
function qr(e, t, n) {
	return t === "runner" || e.some((e) => e.repo === t && e.key === n) ? null : e.find((e) => e.repo === "runner" && e.key === n) ?? null;
}
function Jr(e, t, n, r) {
	let i = N(n?.app.team && e !== "runner" ? E.overview("all") : null, Math.max(r ?? 0, Hr));
	return i.data ? qr(i.data.rows, e, t) : null;
}
function Yr({ reqKey: e, what: t, onOpen: n }) {
	return /* @__PURE__ */ h("div", {
		className: "br-banner is-info",
		role: "status",
		"data-testid": "on-runner",
		children: /* @__PURE__ */ g("div", {
			className: "br-row",
			children: [
				/* @__PURE__ */ g("b", {
					className: "br-strong",
					children: [e, " 已交给运行机"]
				}),
				/* @__PURE__ */ h("span", { children: "交付总览把它列在运行机下，以那边的为准。" }),
				/* @__PURE__ */ h("span", { className: "cto-grow" }),
				/* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: n,
					children: ["打开运行机上的", t]
				})
			]
		})
	});
}
function Xr({ repo: e, reqKey: t, status: n, onPick: r, pollMs: i }) {
	let a = N(E.overview("all"), Math.max(i ?? 0, 3e4)).data?.rows ?? [], o = a.some((n) => n.repo === e && n.key === t);
	if (!a.length || a.length === 1 && o) return null;
	let s = (e) => e.updated_at ?? 0, c = (n?.repos ?? []).map((e) => e.id), l = (e) => c.includes(e) ? c.indexOf(e) : e === "runner" ? c.length : c.length + 1, u = /* @__PURE__ */ new Map();
	for (let e of [...a].sort((e, t) => l(e.repo) - l(t.repo) || s(t) - s(e))) u.set(e.repo, [...u.get(e.repo) ?? [], e]);
	let d = (e) => e === "runner" ? "运行机" : n?.repos.find((t) => t.id === e)?.name ?? e, f = (e) => e.map((e) => /* @__PURE__ */ h("option", {
		value: Wr(e.repo, e.key),
		children: Gr(e)
	}, Wr(e.repo, e.key)));
	return /* @__PURE__ */ g("label", {
		className: "br-switch",
		title: "换一个需求看：在这个视图里打开它",
		children: [/* @__PURE__ */ h("span", { children: "切换需求" }), /* @__PURE__ */ g("select", {
			className: "kt-select",
			"aria-label": "切换需求",
			"data-testid": "br-switch",
			value: Wr(e, t),
			onChange: (n) => {
				let [i, a] = n.target.value.split(Ur);
				i && a && (i !== e || a !== t) && r(i, a);
			},
			children: [!o && /* @__PURE__ */ h("option", {
				value: Wr(e, t),
				children: qr(a, e, t) ? `${t}（已交给运行机）` : Kr(t, d(e))
			}), u.size > 1 ? [...u].map(([e, t]) => /* @__PURE__ */ h("optgroup", {
				label: d(e),
				children: f(t)
			}, e)) : f([...u.values()][0])]
		})]
	});
}
function Zr({ repoName: e, reqKey: t, backName: n, onBack: r, testId: i }) {
	return /* @__PURE__ */ g("section", {
		className: "cto-card br-notfound",
		"aria-label": "没有这个需求",
		"data-testid": i,
		children: [
			/* @__PURE__ */ h("h3", { children: e ? `${e} 仓库里没有 ${t}` : `没有找到 ${t}` }),
			/* @__PURE__ */ h("p", {
				className: "cto-desc",
				children: "它可能已经关闭，或者在别的仓库里。"
			}),
			/* @__PURE__ */ g("p", {
				className: "br-hint",
				children: [
					"做什么：在上面「切换需求」里换一个，或者回",
					n,
					"找。"
				]
			}),
			/* @__PURE__ */ h("div", {
				className: "br-row",
				style: { marginTop: 10 },
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: r,
					children: ["回", n]
				})
			})
		]
	});
}
//#endregion
//#region src/board/Accept.tsx
var Qr = {
	not_yet: "idle",
	waiting: "approve",
	accepted: "ok",
	rejected: "bad",
	merged: "ok"
}, $r = {
	not_yet: "还没到验收",
	waiting: "等验收",
	accepted: "验收过了",
	rejected: "验收被退回",
	merged: "已合并"
}, ei = {
	not_yet: "还没到发布审批",
	waiting: "批准发布",
	accepted: "发布批准了",
	rejected: "发布被退回",
	merged: "已合并"
}, ti = { unclassified: "没归类（「谁定的」没按规定写）" };
function ni(e, t, n = !1) {
	return e ? e === "owner" ? n ? "你（负责人）" : t ? `负责人 ${t}` : "负责人" : /^P-[0-9A-F]{4,}$/i.test(e) ? "一位组员" : e : "";
}
function ri({ text: e }) {
	let t = /（([A-Z]\d+#S\d+[^）]*)）/.exec(e), n = (t ? e.replace(t[0], "") : e).split(/`([^`]+)`/).map((e, t) => t % 2 ? /* @__PURE__ */ h("code", { children: e }, t) : e);
	return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("span", {
		"data-testid": "accept-first",
		children: n
	}), t && /* @__PURE__ */ h("span", {
		className: "kt-dim br-small br-desc-ref",
		title: `出自记录 ${t[1]}`,
		children: " · 出处"
	})] });
}
function ii({ board: e, onDetail: t, quiet: n = !1 }) {
	let r = e.accept, i = e.mr_desc, { copied: a, copy: o } = Rr(i.text), s = or(e), c = s ? "发布审批" : "验收", l = s && r.state === "waiting" ? gr(Qn(e), ei.waiting) : (s ? ei : $r)[r.state], u = e.person.owner, d = e.decisions.filter((e) => e.by === "person"), f = r.by.reduce((e, t) => e + t.count, 0), p = r.state === "merged" || r.state === "accepted", _ = hr(e.checks, e), v = e.sessions.length;
	return /* @__PURE__ */ g("section", {
		id: "br-accept",
		className: `kt-sign${p ? " is-signed" : ""}${r.state === "not_yet" ? " is-idle" : ""}`,
		"aria-label": c,
		"data-testid": "br-accept",
		children: [
			/* @__PURE__ */ g("header", {
				className: "kt-sign-head",
				children: [
					/* @__PURE__ */ h("h2", { children: c }),
					/* @__PURE__ */ h("span", {
						className: `kt-pill tone-${Qr[r.state]}`,
						children: l
					}),
					/* @__PURE__ */ h("p", {
						className: "kt-dim",
						children: "合并前由人确认：变更、决定、检查"
					})
				]
			}),
			/* @__PURE__ */ g("dl", {
				className: "kt-sign-grid",
				children: [
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "需求" }), /* @__PURE__ */ g("dd", { children: [
						/* @__PURE__ */ h("b", {
							className: "br-strong",
							children: e.row.key
						}),
						" ",
						lr(e.row)
					] })] }),
					/* @__PURE__ */ g("div", {
						className: "br-accept-desc",
						children: [/* @__PURE__ */ g("dt", { children: [
							"变更说明 ",
							i.text && /* @__PURE__ */ g("button", {
								type: "button",
								className: "br-link br-small br-copy",
								onClick: () => void o(),
								children: [/* @__PURE__ */ h($, {
									name: "Copy",
									size: 12
								}), "复制"]
							}),
							a === "ok" && /* @__PURE__ */ h("span", {
								className: "br-ok-text br-small",
								role: "status",
								children: " 已复制"
							})
						] }), /* @__PURE__ */ g("dd", { children: [i.first ? /* @__PURE__ */ h(ri, { text: i.first }) : /* @__PURE__ */ h("span", {
							className: "br-dim",
							children: i.error || "还没有"
						}), i.text && /* @__PURE__ */ g("details", {
							className: "br-raw",
							children: [/* @__PURE__ */ h("summary", { children: "看全文" }), /* @__PURE__ */ h("pre", { children: i.text })]
						})] })]
					}),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "检查" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("b", {
						className: `tone-${_.tone}`,
						"data-testid": "accept-checks",
						children: _.text
					}) })] }),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "决定 · 谁定的" }), /* @__PURE__ */ h("dd", { children: f ? /* @__PURE__ */ h("ul", {
						className: "kt-sign-groups",
						children: r.by.map((e) => /* @__PURE__ */ g("li", {
							className: e.id === "person" ? "is-ok" : e.id === "unclassified" ? "is-bad" : "",
							children: [
								ti[e.id] ?? e.label,
								" ",
								e.count
							]
						}, e.id))
					}) : "还没有记下决定" })] }),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "人做的决定" }), /* @__PURE__ */ g("dd", { children: [n ? "回放时不列：决定没有自己的时间" : d.length ? /* @__PURE__ */ h("ul", { children: d.slice(0, 4).map((t) => /* @__PURE__ */ g("li", { children: [
						/* @__PURE__ */ h("b", { children: t.id }),
						" ",
						/* @__PURE__ */ h(ai, { text: t.text }),
						t.who ? /* @__PURE__ */ g("span", {
							className: "kt-dim",
							children: [" · ", ni(t.who, u, e.person.me)]
						}) : null
					] }, t.id)) }) : "（这次没有人拍板的决定）", d.length > 4 && /* @__PURE__ */ g("span", {
						className: "kt-dim br-small",
						children: [
							"还有 ",
							d.length - 4,
							" 条：在需求详情里看"
						]
					})] })] }),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "花了多少" }), /* @__PURE__ */ h("dd", { children: n ? "回放时不算" : /* @__PURE__ */ g(m, { children: [
						e.credits.total === null ? "credits 还没报" : `${Hn(e.credits.total)} credits`,
						" · ",
						v ? `${v} 个会话` : e.credits.total === null ? "还没有会话" : "运行记录里的合计"
					] }) })] })
				]
			}),
			r.done ? /* @__PURE__ */ g("p", {
				className: "kt-sign-done",
				role: "status",
				children: [
					/* @__PURE__ */ h(Y, {
						role: "merge",
						size: 16
					}),
					" ",
					r.done.who ? /* @__PURE__ */ h("b", { children: ni(r.done.who, u, e.person.me) }) : null,
					" ",
					Wn(r.done.at),
					" ",
					r.done.how,
					t && /* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn kt-sign-cto",
						onClick: t,
						children: "需求详情 ↗"
					})
				]
			}) : null
		]
	});
}
function ai({ text: e }) {
	return /* @__PURE__ */ h(m, { children: e.split(/`([^`]+)`/).map((e, t) => t % 2 ? /* @__PURE__ */ h("code", { children: e }, t) : e) });
}
var oi = 5e3, si = 1500;
function ci(e) {
	return e === "bounce" || e === "fail" ? "cross" : e === "pass" || e === "merge" ? "check" : "ring";
}
var li = class {
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
			shape: ci(n.tone),
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
		let n = this.queue.filter((e) => t - e.playAt > oi);
		this.dropped.expired += n.length, this.queue = this.queue.filter((e) => t - e.playAt <= oi), this.active = this.active.filter((e) => t - e.start < e.dur);
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
			dur: o ? si : 900,
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
function ui(e) {
	let t = s(e);
	return t.current = e, t;
}
var di = "(prefers-reduced-motion: reduce)";
function fi() {
	try {
		return typeof window < "u" && typeof window.matchMedia == "function" && !!window.matchMedia(di)?.matches;
	} catch {
		return !1;
	}
}
function pi() {
	let [e, t] = c(fi);
	return i(() => {
		if (typeof window.matchMedia != "function") return;
		let e = window.matchMedia(di);
		if (!e) return;
		let n = () => t(!!e.matches);
		return e.addEventListener?.("change", n), () => e.removeEventListener?.("change", n);
	}, []), e;
}
var mi = /* @__PURE__ */ new Set(), hi = null, gi = Date.now();
function _i(e) {
	return mi.add(e), hi ||= (gi = Date.now(), setInterval(() => {
		if (!(typeof document < "u" && document.hidden)) {
			gi = Date.now();
			for (let e of mi) e();
		}
	}, 1e3)), () => {
		mi.delete(e), !mi.size && hi && (clearInterval(hi), hi = null);
	};
}
function vi() {
	return l(_i, () => gi, () => gi);
}
var yi = t({
	at: Date.now() / 1e3,
	receivedAt: Date.now()
});
function bi() {
	let { at: e, receivedAt: t } = r(yi), n = vi();
	return e + Math.max(0, n - t) / 1e3;
}
function xi(e, t = 900, n = !1) {
	let [r, a] = c(e), o = s(e), l = ui(r);
	return i(() => {
		if (n || typeof requestAnimationFrame != "function") {
			a(e);
			return;
		}
		if (o.current = l.current, o.current === e) return;
		let r = performance.now(), i = 0, s = () => {
			let n = Math.min(1, (performance.now() - r) / t), c = 1 - (1 - n) ** 3;
			a(o.current + (e - o.current) * c), n < 1 && (i = requestAnimationFrame(s));
		};
		return i = requestAnimationFrame(s), () => cancelAnimationFrame(i);
	}, [
		e,
		t,
		n,
		l
	]), r;
}
function Si(e) {
	let t = s({
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
var Ci = 1640, wi = 98, Ti = 24, Ei = 124, Di = 12, Oi = 26, ki = {
	w: 132,
	h: 76
}, Ai = {
	top: 26,
	title: 16,
	group: 17,
	row: 16,
	gap: 3
}, ji = [
	{
		key: "local",
		n: "1",
		title: "本机 · Lean",
		sub: "brain-dev 会话 · 需求和设计审批",
		short: "本机"
	},
	{
		key: "runner",
		n: "2",
		title: "交给运行机",
		sub: "交接 · 桥核对 · 签名 · 运行机做",
		short: "运行机"
	},
	{
		key: "check",
		n: "3",
		title: "检查 · 验收",
		sub: "自动检查 · 发布审批 · 验收",
		short: "检查"
	},
	{
		key: "land",
		n: "4",
		title: "回写",
		sub: "合并以后 · 回写 Brain",
		short: "回写"
	}
], Mi = {
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
}, Ni = {
	local: {
		col: 0,
		half: 0,
		row: 0,
		phase: "local"
	},
	req: {
		col: 0,
		half: 2,
		row: 1,
		phase: "local"
	},
	design: {
		col: 0,
		half: 4,
		row: 2,
		phase: "local"
	},
	handover: {
		col: 1,
		half: 0,
		row: 0,
		phase: "runner"
	},
	bridge: {
		col: 1,
		half: 2,
		row: 1,
		phase: "runner"
	},
	signer: {
		col: 1,
		half: 4,
		row: 2,
		phase: "runner"
	},
	runner: {
		col: 1,
		half: 6,
		row: 3,
		phase: "runner"
	},
	ci: {
		col: 2,
		half: 2,
		row: 0,
		phase: "check"
	},
	release: {
		col: 2,
		half: 4,
		row: 1,
		phase: "check"
	},
	reflect: {
		col: 3,
		half: 4,
		row: 0,
		phase: "land"
	}
}, Pi = {
	slots: Mi,
	byPhase: {
		local: [0, 1],
		runner: [2, 3],
		check: [4],
		land: [5]
	},
	phaseOfCol: [
		"local",
		"local",
		"runner",
		"runner",
		"check",
		"land"
	]
}, Fi = {
	slots: Ni,
	byPhase: {
		local: [0],
		runner: [1],
		check: [2],
		land: [3]
	},
	phaseOfCol: [
		"local",
		"runner",
		"check",
		"land"
	]
}, Ii = (e) => e ? Fi : Pi, Li = (e) => Math.round(e * 10) / 10;
function Ri(e, t) {
	let n = 1 - t, r = n * n * n, i = 3 * n * n * t, a = 3 * n * t * t, o = t * t * t;
	return {
		x: r * e[0].x + i * e[1].x + a * e[2].x + o * e[3].x,
		y: r * e[0].y + i * e[1].y + a * e[2].y + o * e[3].y
	};
}
var zi = (e, t, n) => ({
	x: e.x + (t.x - e.x) * n,
	y: e.y + (t.y - e.y) * n
}), Bi = (e, t) => [
	e,
	zi(e, t, 1 / 3),
	zi(e, t, 2 / 3),
	t
];
function Vi(e, t) {
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
var Hi = (e, t) => [
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
], Ui = (e, t) => [
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
function Wi(e) {
	return e.slice().reverse().map((e) => [
		e[3],
		e[2],
		e[1],
		e[0]
	]);
}
function Gi(e) {
	if (!e.length) return "";
	let t = (e) => `${Li(e.x)},${Li(e.y)}`;
	return `M${t(e[0][0])}${e.map((e) => ` C${t(e[1])} ${t(e[2])} ${t(e[3])}`).join("")}`;
}
function Ki(e) {
	let t = e.map((e) => {
		let t = 0, n = e[0];
		for (let r = 1; r <= 12; r++) {
			let i = Ri(e, r / 12);
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
function qi(e, t) {
	let n = e.segs.length;
	if (!n) return {
		x: 0,
		y: 0
	};
	let r = Math.min(1, Math.max(0, t)) * e.total;
	for (let t = 0; t < n; t++) {
		let i = e.lens[t];
		if (r <= i || t === n - 1) return Ri(e.segs[t], i > 0 ? Math.min(1, r / i) : 1);
		r -= i;
	}
	return e.segs[n - 1][3];
}
function Ji(e, t, n, r, i) {
	if (e.stage === t.stage) {
		let n = t.y > e.y;
		return [Bi({
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
		let e = n[c];
		if (e.folded) continue;
		let t = (e.x - a.x) / (o.x - a.x || 1), l = a.y + (o.y - a.y) * t, u = e.keys.map((e) => r.get(e)).sort((e, t) => e.y - t.y).map((e) => [e.y - 40 - Di, e.y + 40 + Di + Oi]).reduce((e, t) => {
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
	for (let e = 0; e < s.length - 1; e++) c.push(e % 2 == 1 ? Bi(s[e], s[e + 1]) : Vi(s[e], s[e + 1]));
	return c;
}
function Yi(e, t, n = !1) {
	let r = [
		["local", "req"],
		n ? ["req", "design"] : ["local", "design"],
		["req", "handover"],
		["design", "handover"],
		["handover", "bridge"],
		["bridge", "signer"],
		["signer", "runner"],
		["runner", "ci"],
		["ci", "release"],
		["release", "reflect"]
	];
	return e.has("handover") ? t && r.push(["design", "ci"]) : r.push(["req", "ci"], ["design", "ci"]), r.filter(([t, n]) => e.has(t) && e.has(n));
}
function Xi(e) {
	return ji.map((e) => e.key).filter((t) => {
		let n = e.filter((e) => Mi[e.key]?.phase === t);
		return n.length > 0 && n.every((e) => e.status === "skipped");
	});
}
var Zi = .84, Qi = 218;
function $i(e, t) {
	let n = e.phaseOfCol.filter((e) => !t.includes(e)).length, r = ji.filter((e) => t.includes(e.key)).length;
	return 292 + Math.max(0, n - 1) * Qi + r * 92 + 70 + 92;
}
function ea(e, t = []) {
	if (!e) return {
		width: Ci,
		compact: !1
	};
	let n = $i(Pi, t) * Zi > e;
	return {
		width: Math.round(Math.min(Ci, Math.max($i(Ii(n), t), e / Zi))),
		compact: n
	};
}
function ta(e, t, n = 0, r = [], i = Ci, a = !1) {
	let o = i, s = Ii(a), c = s.phaseOfCol.length, l = new Set(r), u = o - 162, d = Array.from({ length: c }, (e, t) => t).filter((e) => !l.has(s.phaseOfCol[e])), f = ji.filter((e) => l.has(e.key)).length, p = (u - 292 - f * 92) / Math.max(1, d.length - 1), m = (e) => {
		let t = ji.filter((t) => l.has(t.key) && s.byPhase[t.key][0] < e).length;
		return Li(292 + Math.max(0, d.indexOf(e)) * p + t * 92);
	}, h = Array.from({ length: c }, (e, t) => ({
		index: t,
		x: m(t),
		keys: [],
		phase: "",
		folded: l.has(s.phaseOfCol[t])
	})), g = 138 + Math.max(4, ...e.filter((e) => s.slots[e] && !l.has(s.slots[e].phase)).map((e) => s.slots[e].half)) / 2 * Ei, _ = /* @__PURE__ */ new Map(), v = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = s.slots[t];
		if (!e || l.has(e.phase)) continue;
		let n = h[e.col];
		n.keys.push(t), n.phase = e.phase, _.set(t, {
			key: t,
			stage: e.col,
			row: e.row,
			x: n.x,
			y: Li(138 + e.half * Ei / 2)
		}), v.set(t, Li(n.x + 92 + 18 + 20 * Math.min(1, e.row)));
	}
	let y = wi + ki.h - 6 + Ai.top + Ai.title + n * Ai.row + Ai.group + Ai.gap, b = Math.max(g + 40 + 62, y + 40), x = /* @__PURE__ */ new Map(), S = [];
	for (let [e, n] of t) {
		let t = _.get(e), r = _.get(n);
		if (!t || !r || e === n) continue;
		let i = Ji(t, r, h, _, x);
		S.push({
			from: e,
			to: n,
			path: i,
			d: Gi(i)
		});
	}
	let C = {
		x: o - 42,
		y: b,
		r: 28
	}, w = [], T = a ? Math.max(106, p / 2 - 4) : 106;
	for (let e of ji) {
		if (l.has(e.key)) continue;
		let t = h.filter((t) => s.byPhase[e.key]?.includes(t.index));
		if (!t.length) continue;
		let n = e.key === ji.find((e) => !l.has(e.key))?.key, r = e.key === [...ji].reverse().find((e) => !l.has(e.key))?.key;
		w.push({
			...e,
			x1: Li(t[0].x - (n ? 106 : T)),
			x2: Li(t[t.length - 1].x + (r ? 106 : T)),
			used: t.some((e) => e.keys.length > 0)
		});
	}
	for (let e = 1; e < w.length; e++) {
		if (ji.findIndex((t) => t.key === w[e].key) - ji.findIndex((t) => t.key === w[e - 1].key) > 1) continue;
		let t = (w[e - 1].x2 - 14 + w[e].x1 + 14) / 2;
		w[e - 1].x2 = Li(Math.min(w[e - 1].x2, t - 4)), w[e].x1 = Li(Math.max(w[e].x1, t + 4));
	}
	for (let e of ji.filter((e) => l.has(e.key))) {
		let t = ji.indexOf(e), n = w.filter((e) => ji.findIndex((t) => t.key === e.key) < t).sort((e, t) => t.x2 - e.x2)[0], r = w.filter((e) => ji.findIndex((t) => t.key === e.key) > t).sort((e, t) => e.x1 - t.x1)[0], i = n ? n.x2 : 200, a = (i + (r ? r.x1 : Math.min(o - 8, i + 92 + 4))) / 2;
		w.push({
			...e,
			x1: Li(a - 40),
			x2: Li(a + 40),
			used: !1
		});
	}
	w.sort((e, t) => e.x1 - t.x1), w.unshift({
		key: "init",
		n: "0",
		title: "认领",
		sub: "认领 · 文档过五关 · 开工",
		short: "认领",
		x1: 8,
		x2: Li((w[0]?.x1 ?? 200) - 8),
		used: !0
	});
	let E = {
		x: Li(102),
		y: wi + ki.h / 2 - 6
	};
	return {
		width: o,
		height: b + 44,
		nodes: _,
		stages: h,
		edges: S,
		rail: {
			x1: Ti,
			x2: C.x - 28,
			y: b
		},
		station: C,
		mergeX: v,
		phases: w,
		orch: E
	};
}
var na = "tests", ra = "orch";
function ia(e, t, n) {
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
function aa(e, t, n) {
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
		w: ki.w,
		h: ki.h,
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
var oa = 68;
function sa(e, t) {
	let n = e.orch, r = e.nodes.get(t);
	if (!r) return null;
	let i = {
		x: n.x + ki.w / 2,
		y: n.y
	}, a = r.x - 92 - 18, o = {
		x: Math.min(i.x + 28, a - 18),
		y: oa
	}, s = {
		x: a,
		y: Math.max(86, r.y - 18)
	}, c = {
		x: r.x - 92,
		y: r.y
	};
	return [
		Vi(i, o),
		Bi(o, {
			x: a - 18,
			y: oa
		}),
		Hi({
			x: a - 18,
			y: oa
		}, s),
		Ui(s, c)
	];
}
function ca(e, t) {
	let n = e.nodes.get(t), r = e.mergeX.get(t);
	if (!n || r === void 0) return null;
	let i = {
		x: n.x + 92,
		y: n.y
	}, a = {
		x: r,
		y: n.y + 24
	};
	return [Hi(i, a), Bi(a, {
		x: r,
		y: e.rail.y
	})];
}
function la(e, t, n, r) {
	if (t === n) return null;
	let i = e.station;
	if (t === "orch" && e.nodes.has(n)) return sa(e, n);
	if (n === "orch" && e.nodes.has(t)) {
		let n = sa(e, t);
		return n ? Wi(n) : null;
	}
	if (n === "run" && e.nodes.has(t)) return ca(e, t);
	if (t === "run" && n === "tests") return [Bi({
		x: Math.min(r, i.x - i.r - 20),
		y: e.rail.y
	}, {
		x: i.x - i.r,
		y: e.rail.y
	})];
	if (t === "tests" && e.nodes.has(n)) {
		let t = ca(e, n), r = e.mergeX.get(n);
		return !t || r === void 0 ? null : [Bi({
			x: i.x - i.r,
			y: e.rail.y
		}, {
			x: r,
			y: e.rail.y
		}), ...Wi(t)];
	}
	if (e.nodes.has(t) && e.nodes.has(n)) {
		let r = e.edges.find((e) => e.from === t && e.to === n);
		if (r) return r.path;
		let i = e.edges.find((e) => e.from === n && e.to === t);
		if (i) return Wi(i.path);
		let a = e.nodes.get(t), o = e.nodes.get(n);
		return a.stage === o.stage ? [Bi({
			x: a.x,
			y: a.y + (o.y > a.y ? 40 : -40)
		}, {
			x: o.x,
			y: o.y + (o.y > a.y ? -40 : 40)
		})] : o.x >= a.x ? [Vi({
			x: a.x + 92,
			y: a.y
		}, {
			x: o.x - 92,
			y: o.y
		})] : [Vi({
			x: a.x - 92,
			y: a.y
		}, {
			x: o.x + 92,
			y: o.y
		})];
	}
	let a = ia(e, t, r), o = ia(e, n, r);
	return a && o ? [Vi(a, o)] : null;
}
function ua(e, t) {
	for (let n = t.length - 1; n >= 0; n--) {
		let r = e.mergeX.get(t[n].actor);
		if (r !== void 0) return r;
	}
	return e.rail.x1 + 120;
}
//#endregion
//#region src/board/overlay.ts
var da = "http://www.w3.org/2000/svg", fa = 9, pa = 96, ma = (e) => typeof requestAnimationFrame == "function" ? requestAnimationFrame(e) : setTimeout(() => e(performance.now()), 16), ha = (e) => typeof cancelAnimationFrame == "function" ? cancelAnimationFrame(e) : clearTimeout(e), ga = (e) => e < .5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2, _a = (e) => 1 - (1 - e) ** 3, va = (e) => e.toFixed(1), ya = class {
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
		!this.stopped && this.handle === null && this.engine.busy && (this.handle = (this.opts.raf ?? ma)(this.tick));
	}
	dispose() {
		this.stopped = !0, this.handle !== null && (this.opts.caf ?? ha)(this.handle), this.handle = null;
		for (let e of this.pool) e.remove();
		this.pool.length = 0, this.routes.clear();
	}
	tick = () => {
		this.handle = null;
		let e = this.opts.perf ?? (() => performance.now()), t = e(), n = this.engine.frame(this.opts.now());
		this.draw(n.particles), this.engine.report(e() - t), this.opts.onFrame?.(n), this.engine.busy && !this.stopped ? this.handle = (this.opts.raf ?? ma)(this.tick) : this.hideFrom(0);
	};
	shape(e) {
		let t = this.pool[e];
		if (t) return t;
		let n = document.createElementNS(da, "g"), r = (e) => {
			let t = document.createElementNS(da, "circle");
			return t.setAttribute("class", e), t;
		}, i = (e, t) => {
			let n = document.createElementNS(da, "path");
			return n.setAttribute("class", e), n.setAttribute("d", t), n;
		}, a = (e) => {
			let t = document.createElementNS(da, "polyline");
			return t.setAttribute("class", e), t;
		}, o = document.createElementNS(da, "rect");
		o.setAttribute("class", "kt-p-ring");
		let s = document.createElementNS(da, "text");
		return s.setAttribute("class", "kt-p-label"), s.setAttribute("text-anchor", "middle"), n.append(a("kt-p-tail-glow"), a("kt-p-tail"), r("kt-p-halo"), r("kt-p-head"), o, i("kt-p-cross", "M-6,-6 L6,6 M6,-6 L-6,6"), i("kt-p-check", "M-6,0 L-2,4.5 L6.5,-5"), s), this.group.appendChild(n), this.pool[e] = n, n;
	}
	route(e) {
		if (this.routes.has(e.id)) return this.routes.get(e.id) ?? null;
		let t = this.opts.path(e.from, e.to), n = t && t.length ? Ki(t) : null;
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
				let i = Math.min(1.8, 1 + .25 * (r.count - 1)) * (r.prio >= 3 ? 1.15 : 1), a = ga(r.p), o = qi(e, a), s = t.children, c = Math.min(a, pa / Math.max(1, e.total)), l = [];
				for (let t = 0; t <= fa; t++) {
					let n = qi(e, a - c + c * t / fa);
					l.push(`${va(n.x)},${va(n.y)}`);
				}
				let u = l.join(" ");
				for (let e of [0, 1]) s[e].setAttribute("points", u), s[e].setAttribute("stroke-width", va((e === 0 ? 9 : 3.2) * i)), s[e].setAttribute("display", "inline");
				ba(s[2], o, 12 * i), ba(s[3], o, 5.4 * i);
				for (let e = 4; e < 7; e++) s[e].setAttribute("display", "none");
				let d = s[7];
				r.label ? (d.textContent !== r.label && (d.textContent = r.label), d.setAttribute("x", va(o.x)), d.setAttribute("y", va(o.y - 15 * i)), d.setAttribute("display", "inline")) : d.setAttribute("display", "none"), t.setAttribute("opacity", va(Math.min(1, r.p / .06, (1 - r.p) / .08 + .35)));
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
			let o = _a(r.p), s = (r.shape === "spark" ? 7 : 26) * Math.min(1.6, 1 + .2 * (r.count - 1)) * o, c = a[4];
			c.setAttribute("x", va(e.x - e.w / 2 - s)), c.setAttribute("y", va(e.y - e.h / 2 - s)), c.setAttribute("width", va(e.w + 2 * s)), c.setAttribute("height", va(e.h + 2 * s)), c.setAttribute("rx", va(e.rx + s / 2)), c.setAttribute("stroke-width", va(r.shape === "spark" ? 2 : 4 - 2.5 * o)), c.setAttribute("display", "inline");
			let l = r.shape === "cross" ? a[5] : r.shape === "check" ? a[6] : null;
			for (let e of [5, 6]) a[e] !== l && a[e].setAttribute("display", "none");
			l && (l.setAttribute("display", "inline"), l.setAttribute("transform", `translate(${va(e.x + e.w / 2 - 4)},${va(e.y - e.h / 2 - 6 - 10 * o)}) scale(${(1.7 - .5 * o).toFixed(2)})`)), i.setAttribute("opacity", va(1 - r.p * r.p));
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
function ba(e, t, n) {
	e.setAttribute("cx", va(t.x)), e.setAttribute("cy", va(t.y)), e.setAttribute("r", va(n)), e.setAttribute("display", "inline");
}
//#endregion
//#region src/board/NodeCard.tsx
function xa({ a: e, label: t, onSession: n }) {
	let r = Mn(e.status);
	return /* @__PURE__ */ g("div", {
		className: "kt-ncard-body",
		children: [
			/* @__PURE__ */ g("p", {
				className: "kt-ncard-head",
				children: [
					/* @__PURE__ */ h(Y, {
						role: e.icon,
						size: 16
					}),
					" ",
					/* @__PURE__ */ h("b", { children: e.title }),
					/* @__PURE__ */ h("span", {
						className: `kt-pill tone-${r.tone}`,
						children: t ?? r.label
					})
				]
			}),
			/* @__PURE__ */ g("p", {
				className: "kt-ncard-task",
				children: [
					/* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: "是什么"
					}),
					" ",
					e.sub
				]
			}),
			/* @__PURE__ */ h("p", {
				className: e.status === "awaiting_approval" || e.status === "failed" ? "kt-ncard-back" : "kt-ncard-did",
				children: e.doing
			}),
			/* @__PURE__ */ g("ul", {
				className: "kt-ncard-facts",
				children: [
					e.since !== null && /* @__PURE__ */ g("li", { children: [
						"从 ",
						Wn(e.since),
						" 起"
					] }),
					e.facts.map((e) => /* @__PURE__ */ h("li", { children: e }, e)),
					e.credits !== null && /* @__PURE__ */ g("li", { children: [Hn(e.credits), " credits"] }),
					e.line && /* @__PURE__ */ g("li", { children: ["要你自己在会话里打：", /* @__PURE__ */ h("code", { children: e.line })] })
				]
			}),
			e.session && n && /* @__PURE__ */ h("div", {
				className: "kt-ncard-actions",
				children: /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => n(e.session.url),
					children: Z.openSession
				})
			})
		]
	});
}
//#endregion
//#region src/board/next.ts
var Sa = (e) => ct(e) && e.answerable_here && !e.lean_request, Ca = (e) => /审查/.test(e) && /新会话/.test(e), wa = `${Z.review}会把 Lean 的审查要求发给新会话`, Ta = (e) => e.review ?? Ca(e.text);
function Ea(e) {
	let t = e.row.state, n = e.actors.filter((e) => e.status === "awaiting_approval");
	return t === "claimed" ? "start" : t === "rejected" ? "redo_handoff" : t === "acceptance" ? "accept" : t === "parked" ? "answer" : e.accept.step.line || n.some((e) => e.line) ? "approve" : n.some((e) => e.doing.includes("工具调用")) ? "tool" : t === "merged" && e.actors.find((e) => e.key === "reflect")?.status === "awaiting_approval" ? "write_back" : t === "local" && e.row.waits.who === "you" ? "reply" : "none";
}
var Da = (e) => e.row.waits.do ?? Ea(e);
function Oa(e, t) {
	if (e.line) return "approve";
	if (e.key === "release") return "accept";
	if (e.key === "reflect") return "write_back";
	if (e.status === "failed" || e.doing.includes("接手被拒")) return "redo_handoff";
	if (e.doing.includes("工具调用")) return "tool";
	if (e.key === "local") {
		let e = Da(t);
		if (e === "reply" || e === "tool" || e === "approve") return e;
	}
	return "answer";
}
var ka = (e) => e.accept.step.session_url ?? e.actors.find((e) => e.key === "local")?.session?.url ?? null;
function Aa(e) {
	let t = e.row.waits, n = t.who === "you", r = e.accept.step.mr_url ?? e.row.mr?.url ?? null, i = e.actors.filter((e) => e.status === "awaiting_approval"), a = t.since === void 0 ? i.map((e) => e.since).filter((e) => e !== null).sort((e, t) => e - t)[0] ?? null : t.since;
	if (!n) return {
		who: t.who,
		mine: n,
		since: a,
		steps: [],
		text: t.text,
		mr: r
	};
	let o = [];
	e.questions.forEach((e, t) => {
		Sa(e) && o.push({
			id: `q-${e.id ?? t}`,
			do: "answer",
			text: e.question,
			question: e
		});
	});
	let s = e.accept.step, c = Da(e), l = ka(e), u = s.text || t.text;
	if (u && c !== "none" && c !== "watch") {
		let n = {
			id: "main",
			do: c,
			text: u,
			line: s.line,
			mr: s.mr_url,
			session: s.session_url
		};
		if (c === "reply") {
			let r = dr(e.row.lean).next;
			n.session = s.session_url ?? l, Ta(t) ? Object.assign(n, {
				text: t.text,
				line: null,
				review: !0,
				hint: wa,
				say: t.review === void 0 ? null : s.line
			}) : r && !u.includes(r.label) && (n.hint = `Lean 的下一步是「${r.label}」：在会话里让它接着做`);
		}
		c === "tool" && (n.session = s.session_url ?? l), c === "redo_handoff" && (n.why = t.text.replace(/^接手被拒[：:]\s*/, ""), n.text = u.split("\n").filter((e) => !e.startsWith("接手被拒")).join("\n") || u, n.command = {
			text: "brain handoff",
			cwd: e.row.worktree
		}, n.raw = t.raw || void 0, n.session = s.session_url ?? l, n.mr = s.mr_url ?? r), c === "answer" && o.some((e) => e.question) && (n.text = ""), n.text && o.push(n);
	}
	for (let t of i) t.line && t.line !== s.line ? o.push({
		id: `a-${t.key}`,
		do: "approve",
		text: t.doing,
		line: t.line,
		session: t.session?.url ?? l
	}) : !t.line && Oa(t, e) === "tool" && c !== "tool" && o.push({
		id: `a-${t.key}`,
		do: "tool",
		text: t.doing,
		session: t.session?.url ?? l
	});
	return {
		who: t.who,
		mine: n,
		since: a,
		steps: o,
		text: t.text,
		mr: r
	};
}
function ja(e, t = !1) {
	return ar(e) && !t ? Aa(e).steps.length : e.actors.filter((e) => e.status === "awaiting_approval").length;
}
//#endregion
//#region src/board/ActorGraph.tsx
var Ma = 2400, Na = () => `-${Math.round(performance.now() % Ma)}ms`;
function Pa(e) {
	let [t] = c(Na);
	return e ? void 0 : { animationDelay: t };
}
function Fa({ w: e, h: t, reducedMotion: n }) {
	let r = Pa(n);
	return /* @__PURE__ */ h("rect", {
		className: "kt-node-halo",
		x: -e / 2 - 8,
		y: -t / 2 - 8,
		width: e + 16,
		height: t + 16,
		rx: 23,
		style: r
	});
}
function Ia(e) {
	let t = e.brain.cited.length;
	return 2 + Math.min(4, t) + +(t > 4) + +!!e.brain.stale.length;
}
function La({ board: e, lay: t, focus: r, onActor: a, flashes: l, reducedMotion: u, feed: d, quiet: f = !1, onSession: p, onAct: m }) {
	let [_, v] = c(null), y = s(null), b = n((e, t) => {
		y.current && clearTimeout(y.current), y.current = setTimeout(() => v(e), t);
	}, []);
	i(() => () => void (y.current && clearTimeout(y.current)), []);
	let x = o(() => new li({
		now: () => performance.now(),
		reducedMotion: u
	}), [u]), S = s(null), C = ua(t, e.belt), w = ui(t), T = ui(C), E = o(() => new Map(e.actors.map((e) => [e.key, e])), [e.actors]), D = n((e) => {
		S.current?.dispose(), S.current = e && !u ? new ya(e, x, {
			path: (e, t) => la(w.current, e, t, T.current),
			box: (e) => aa(w.current, e, T.current),
			now: () => performance.now()
		}) : null;
	}, [
		x,
		u,
		w,
		T
	]);
	i(() => (d.current = (e) => {
		x.ingest(e, performance.now()), S.current?.wake();
	}, () => {
		d.current = null;
	}), [x, d]), i(() => {
		let e = () => {
			x.setHidden(document.hidden, performance.now()), document.hidden || S.current?.wake();
		};
		return document.addEventListener("visibilitychange", e), () => document.removeEventListener("visibilitychange", e);
	}, [x]), i(() => () => S.current?.dispose(), []);
	let O = e.actors.filter((e) => Pn.has(e.status)).length, k = ja(e, f), A = e.actors.filter((e) => e.status === "merged").length, j = ar(e), M = Qn(e), N = `需求的路：${e.actors.length} 个环节，${O} 个在做${k ? `，${k} 个${j ? "等你" : M}` : ""}，${A} 个完成；检查 ${e.checks.passed}/${e.checks.total}。点一个环节只看它。`;
	return /* @__PURE__ */ g("div", {
		className: "kt-graph is-phased br-graph",
		"data-testid": "kt-graph",
		children: [/* @__PURE__ */ g(za, {
			minWidth: Math.floor(t.width * Zi),
			children: [
				/* @__PURE__ */ g("svg", {
					className: "kt-graph-svg",
					viewBox: `0 0 ${t.width} ${t.height}`,
					role: "group",
					"aria-label": N,
					children: [
						/* @__PURE__ */ h(Ha, {}),
						/* @__PURE__ */ h("rect", {
							className: "kt-g-bg",
							x: 0,
							y: 0,
							width: t.width,
							height: t.height,
							fill: "url(#kt-dots)"
						}),
						/* @__PURE__ */ h(Wa, {
							board: e,
							lay: t,
							byKey: E,
							reducedMotion: u
						}),
						j && /* @__PURE__ */ h(Ja, {
							board: e,
							lay: t
						}),
						/* @__PURE__ */ h(qa, {
							board: e,
							lay: t,
							flash: l.orch,
							reducedMotion: u,
							mine: j,
							onHover: (e) => b(e ? Ra : null, e ? 300 : 250)
						}),
						/* @__PURE__ */ h(Ya, {
							board: e,
							lay: t,
							quiet: f
						}),
						/* @__PURE__ */ h("g", {
							className: "kt-edges",
							"aria-hidden": "true",
							children: t.edges.map((e) => {
								let t = Va(E.get(e.from), E.get(e.to)), n = !!r && (e.from === r || e.to === r);
								return /* @__PURE__ */ h("path", {
									className: `kt-edge is-${t}${r ? n ? " is-hot" : " is-dim" : ""}`,
									d: e.d,
									markerEnd: `url(#kt-arrow-${t})`
								}, `${e.from}>${e.to}`);
							})
						}),
						/* @__PURE__ */ h(Xa, {
							board: e,
							lay: t,
							head: C,
							focus: r,
							flash: l.run
						}),
						/* @__PURE__ */ h(Za, {
							board: e,
							lay: t,
							flash: l.tests
						}),
						/* @__PURE__ */ g("g", {
							className: "kt-nodes",
							children: [e.actors.map((e) => {
								let n = t.nodes.get(e.key);
								return n ? /* @__PURE__ */ h(Qa, {
									a: e,
									box: n,
									focus: r,
									flash: l[e.key],
									onActor: a,
									reducedMotion: u,
									quiet: f,
									mine: j,
									who: M,
									onHover: (t) => b(t ? e.key : null, t ? 300 : 250)
								}, e.key) : null;
							}), !f && j && e.actors.filter((e) => e.status === "awaiting_approval" && t.nodes.get(e.key)).map((n) => /* @__PURE__ */ h(no, {
								a: n,
								d: Oa(n, e),
								review: n.key === "local" && Ta(e.row.waits),
								box: t.nodes.get(n.key),
								onAct: m
							}, `wait-${n.key}`))]
						}),
						/* @__PURE__ */ h("g", {
							className: "kt-particles",
							"aria-hidden": "true",
							ref: D
						})
					]
				}),
				_ === Ra && /* @__PURE__ */ h("div", {
					className: "kt-ncard",
					style: {
						top: `${(t.orch.y - 40) / t.height * 100}%`,
						left: `${(t.orch.x + 76) / t.width * 100}%`
					},
					"data-testid": "kt-ncard",
					role: "dialog",
					"aria-label": "负责人",
					onMouseEnter: () => b(Ra, 0),
					onMouseLeave: () => b(null, 200),
					children: /* @__PURE__ */ h(Ba, {
						board: e,
						mine: j,
						who: M
					})
				}),
				_ && E.get(_) && t.nodes.get(_) && (() => {
					let n = t.nodes.get(_), r = n.x > t.width * .62, i = {
						...n.y > t.height * .55 ? { bottom: `${Math.max(1, (t.height - (n.y + 40)) / t.height * 100)}%` } : { top: `${Math.max(1, (n.y - 40) / t.height * 100)}%` },
						...r ? { right: `${(t.width - (n.x - 92 - 10)) / t.width * 100}%` } : { left: `${(n.x + 92 + 10) / t.width * 100}%` }
					};
					return /* @__PURE__ */ h("div", {
						className: "kt-ncard",
						style: i,
						"data-testid": "kt-ncard",
						role: "dialog",
						"aria-label": `${E.get(_).title}做了什么`,
						onMouseEnter: () => b(_, 0),
						onMouseLeave: () => b(null, 200),
						children: /* @__PURE__ */ h(xa, {
							a: E.get(_),
							label: $n(E.get(_).status, e),
							onSession: f ? void 0 : p
						})
					}, _);
				})()
			]
		}), /* @__PURE__ */ h(io, {
			handover: e.actors.some((e) => (e.key === "handover" || e.key === "signer") && e.status !== "skipped"),
			others: nr(e)
		})]
	});
}
var Ra = "__person";
function za({ minWidth: e, children: t }) {
	let r = s(null), [a, o] = c({
		left: !1,
		right: !1
	}), l = n(() => {
		let e = r.current;
		if (!e) return;
		let t = {
			left: e.scrollLeft > 4,
			right: e.scrollLeft + e.clientWidth < e.scrollWidth - 4
		};
		o((e) => e.left === t.left && e.right === t.right ? e : t);
	}, []);
	i(() => {
		l();
		let e = r.current;
		if (!e || typeof ResizeObserver > "u") return;
		let t = new ResizeObserver(l);
		return t.observe(e), () => t.disconnect();
	}, [l, e]);
	let u = (e) => r.current?.scrollBy?.({
		left: e * r.current.clientWidth * .6,
		behavior: "smooth"
	});
	return /* @__PURE__ */ g("div", {
		className: `br-graph-view${a.left ? " has-left" : ""}${a.right ? " has-right" : ""}`,
		children: [
			/* @__PURE__ */ h("div", {
				className: "br-graph-scroll",
				ref: r,
				onScroll: l,
				"data-testid": "kt-graph-scroll",
				children: /* @__PURE__ */ h("div", {
					className: "kt-graph-stage",
					style: { minWidth: e },
					children: t
				})
			}),
			a.left && /* @__PURE__ */ h("button", {
				type: "button",
				className: "br-graph-more is-left",
				onClick: () => u(-1),
				children: "← 左边还有"
			}),
			a.right && /* @__PURE__ */ h("button", {
				type: "button",
				className: "br-graph-more is-right",
				onClick: () => u(1),
				"data-testid": "kt-graph-more",
				children: "右边还有 →"
			})
		]
	});
}
function Ba({ board: e, mine: t, who: n }) {
	let r = e.person, i = e.row.waits;
	return /* @__PURE__ */ g("div", {
		className: "kt-ncard-body",
		children: [
			/* @__PURE__ */ g("p", {
				className: "kt-ncard-head",
				children: [
					/* @__PURE__ */ h(Y, {
						role: "person",
						size: 16
					}),
					" ",
					/* @__PURE__ */ g("b", { children: [r.me ? "你" : "负责人", r.owner ? `（${r.owner}）` : ""] }),
					r.status === "awaiting_approval" && /* @__PURE__ */ h("span", {
						className: `kt-pill tone-${t ? "approve" : "info"}`,
						children: t ? "等你" : n
					})
				]
			}),
			/* @__PURE__ */ h("p", {
				className: t && r.status === "awaiting_approval" ? "kt-ncard-back" : "kt-ncard-did",
				children: r.doing
			}),
			i.since ? /* @__PURE__ */ h("ul", {
				className: "kt-ncard-facts",
				children: /* @__PURE__ */ g("li", { children: [
					"从 ",
					Wn(i.since),
					" 起"
				] })
			}) : null
		]
	});
}
function Va(e, t) {
	return !e || !t || e.status !== "merged" && e.status !== "done" ? "pending" : t.status !== "waiting" && t.status !== "skipped" ? "used" : "ready";
}
function Ha() {
	return /* @__PURE__ */ g("defs", { children: [
		/* @__PURE__ */ h("pattern", {
			id: "kt-dots",
			width: 22,
			height: 22,
			patternUnits: "userSpaceOnUse",
			children: /* @__PURE__ */ h("circle", {
				className: "kt-g-dot",
				cx: 2,
				cy: 2,
				r: 1
			})
		}),
		/* @__PURE__ */ h("pattern", {
			id: "kt-hatch",
			width: 9,
			height: 9,
			patternUnits: "userSpaceOnUse",
			patternTransform: "rotate(45)",
			children: /* @__PURE__ */ h("rect", {
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
		].map((e) => /* @__PURE__ */ h("marker", {
			id: `kt-arrow-${e}`,
			viewBox: "0 0 10 10",
			refX: 8.5,
			refY: 5,
			markerWidth: 7,
			markerHeight: 7,
			orient: "auto-start-reverse",
			children: /* @__PURE__ */ h("path", {
				className: `kt-arrow is-${e}`,
				d: "M0,0.8 L9,5 L0,9.2 Z"
			})
		}, e))
	] });
}
function Ua(e, t) {
	if (or(t)) {
		if (e.key === "runner") return {
			n: "",
			title: e.title,
			sub: e.sub
		};
		if (e.key === "check") return {
			n: "2",
			title: "检查 · 发布",
			sub: "自动检查 · 发布审批"
		};
		if (e.key === "land") return {
			n: "3",
			title: e.title,
			sub: e.sub
		};
	}
	return e.key === "local" && t.actors.find((e) => e.key === "design")?.status === "skipped" ? {
		n: e.n,
		title: e.title,
		sub: "brain-dev 会话 · 需求审批"
	} : {
		n: e.n,
		title: e.title,
		sub: e.sub
	};
}
function Wa({ board: e, lay: t, byKey: n, reducedMotion: r }) {
	let i = or(e) ? "只在本机做" : "";
	return /* @__PURE__ */ h("g", {
		className: "kt-phases",
		"aria-hidden": "true",
		children: t.phases.map((a) => {
			if (!a.used && a.key !== "init") return /* @__PURE__ */ h(Ga, {
				p: a,
				n: Ua(a, e).n,
				lay: t,
				why: a.key === "runner" ? i : ""
			}, a.key);
			let o = (a.key === "init" ? [] : t.stages.filter((e) => e.phase === a.key).flatMap((e) => e.keys)).map((e) => n.get(e)).filter((e) => !!e), s = o.some((e) => Fn.has(e.status)), c = o.filter((e) => Pn.has(e.status)).length, l = o.length > 0 && o.every((e) => e.status === "skipped"), u = o.length > 0 && !l && o.every((e) => Nn(e.status)), d = (a.x1 + a.x2) / 2, f = a.key === "init", p = Ua(a, e);
			return /* @__PURE__ */ g("g", {
				className: `kt-phase${l ? " is-unused" : ""}${s || f && e.person.status === "awaiting_approval" ? " is-live" : ""}${u ? " is-done" : ""}`,
				"data-phase": a.key,
				children: [
					/* @__PURE__ */ h("rect", {
						className: "kt-phase-band",
						x: a.x1,
						y: 8,
						width: a.x2 - a.x1,
						height: t.rail.y - 34,
						rx: 18
					}),
					/* @__PURE__ */ g("text", {
						className: "kt-phase-title",
						x: d,
						y: 30,
						textAnchor: "middle",
						children: [p.n ? `${p.n} ` : "", p.title]
					}),
					/* @__PURE__ */ h("text", {
						className: "kt-phase-stages",
						x: d,
						y: 48,
						textAnchor: "middle",
						children: qn(p.sub, Math.max(6, (a.x2 - a.x1) / 13))
					}),
					l && /* @__PURE__ */ h("text", {
						className: "kt-phase-note",
						x: d,
						y: t.rail.y / 2 + 10,
						textAnchor: "middle",
						children: "这次不需要"
					}),
					c >= 2 && /* @__PURE__ */ g("g", {
						className: "kt-par",
						transform: `translate(${d},78)`,
						children: [
							/* @__PURE__ */ h("rect", {
								x: -52,
								y: -12,
								width: 104,
								height: 24,
								rx: 12
							}),
							/* @__PURE__ */ h(Ka, { reducedMotion: r }),
							/* @__PURE__ */ g("text", {
								x: 6,
								y: 4.5,
								textAnchor: "middle",
								children: ["同时在做 ", c]
							})
						]
					})
				]
			}, a.key);
		})
	});
}
function Ga({ p: e, n: t, lay: n, why: r }) {
	let i = (e.x1 + e.x2) / 2;
	return /* @__PURE__ */ g("g", {
		className: "kt-phase is-unused is-folded",
		"data-phase": e.key,
		"data-testid": "kt-phase-folded",
		children: [
			/* @__PURE__ */ h("rect", {
				className: "kt-phase-band",
				x: e.x1,
				y: 8,
				width: e.x2 - e.x1,
				height: n.rail.y - 34,
				rx: 14
			}),
			/* @__PURE__ */ g("text", {
				className: "kt-phase-title",
				x: i,
				y: 30,
				textAnchor: "middle",
				children: [t ? `${t} ` : "", e.short]
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-phase-note",
				x: i,
				y: 58,
				textAnchor: "middle",
				children: "这次不需要"
			}),
			r && /* @__PURE__ */ h("text", {
				className: "kt-phase-stages",
				x: i,
				y: 76,
				textAnchor: "middle",
				children: r
			})
		]
	});
}
function Ka({ reducedMotion: e }) {
	let t = Pa(e);
	return /* @__PURE__ */ h("circle", {
		className: "kt-par-dot",
		cx: -38,
		cy: 0,
		r: 4,
		style: t
	});
}
function qa({ board: e, lay: t, flash: n, reducedMotion: r, mine: i, onHover: a }) {
	let { w: o, h: s } = ki, c = e.person, l = c.status === "awaiting_approval" && i, u = c.status === "awaiting_approval" && !i;
	return /* @__PURE__ */ g("g", {
		className: `kt-orch br-person is-${u ? "waiting" : c.status}${l ? " is-active" : ""}${u ? " is-other" : ""}`,
		transform: `translate(${t.orch.x},${t.orch.y})`,
		"data-testid": "kt-orch",
		tabIndex: 0,
		"aria-label": `负责人 ${c.owner ?? ""}：${c.doing}`,
		onMouseEnter: () => a?.(!0),
		onMouseLeave: () => a?.(!1),
		onFocus: () => a?.(!0),
		onBlur: () => a?.(!1),
		children: [
			l && /* @__PURE__ */ h(Fa, {
				w: o,
				h: s,
				reducedMotion: r
			}),
			/* @__PURE__ */ h("rect", {
				className: "kt-orch-body",
				x: -o / 2,
				y: -s / 2,
				width: o,
				height: s,
				rx: 18
			}),
			/* @__PURE__ */ h(Te, {
				role: "person",
				cx: -o / 2 + 22,
				cy: -12,
				size: 20,
				className: "kt-node-emoji"
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-orch-title",
				x: -o / 2 + 38,
				y: -6,
				children: c.me ? "你" : "负责人"
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-orch-cn",
				x: -o / 2 + 38,
				y: 13,
				style: { fontSize: 12 },
				children: qn(c.owner ?? "—", 7)
			}),
			/* @__PURE__ */ h("text", {
				className: `kt-orch-sub${l ? " is-wait" : ""}${u ? " is-other" : ""}`,
				y: 30,
				textAnchor: "middle",
				children: qn(l ? `✋ ${c.doing}` : c.doing, 10.5)
			}),
			n && /* @__PURE__ */ h("rect", {
				className: `kt-node-flash is-${n.tone}`,
				x: -o / 2 - 5,
				y: -s / 2 - 5,
				width: o + 10,
				height: s + 10,
				rx: 22
			}, n.n)
		]
	});
}
function Ja({ board: e, lay: t }) {
	return /* @__PURE__ */ h("g", {
		className: "kt-cmds",
		"aria-hidden": "true",
		children: e.actors.filter((e) => e.status === "awaiting_approval").map((e) => {
			let n = sa(t, e.key);
			return n ? /* @__PURE__ */ h("path", {
				className: "kt-cmd is-awaiting_approval",
				d: Gi(n)
			}, e.key) : null;
		})
	});
}
function Ya({ board: e, lay: t, quiet: n }) {
	let r = t.orch.y + ki.h / 2 + Ai.top, i = ki.w + 12, a = e.brain, o = [
		{
			text: a.loaded === null ? "载入 —" : `载入 ${a.loaded} 条`,
			cls: a.loaded ? "is-team is-used" : "is-team",
			tip: "开工时从 Brain 带进来的条目"
		},
		n ? {
			text: "引用 —",
			cls: "is-team",
			tip: "回放时不算：引用记在决定里，决定没有自己的时间"
		} : {
			text: `引用 ${a.cited.length} 条`,
			cls: a.cited.length ? "is-team is-used" : "is-team",
			tip: "决定里引用的 Brain 条目"
		},
		...a.cited.slice(0, 4).map((e) => ({
			text: e,
			cls: "is-team is-used",
			tip: `引用了 ${e}`
		})),
		...a.cited.length > 4 ? [{
			text: `+${a.cited.length - 4} 条`,
			cls: "is-team",
			tip: a.cited.slice(4).join("、")
		}] : [],
		...a.stale.length ? [{
			text: `过时 ${a.stale.length} 条`,
			cls: "is-team is-busy",
			tip: `引用了过时的 ${a.stale.join("、")}`
		}] : []
	], s = Ai.title;
	return /* @__PURE__ */ g("g", {
		className: "kt-roster",
		transform: `translate(${t.orch.x},${r})`,
		"data-testid": "kt-roster",
		children: [/* @__PURE__ */ h("text", {
			className: "kt-roster-title",
			y: 0,
			textAnchor: "middle",
			children: "Brain 带来的知识"
		}), o.map((e, t) => {
			let n = s;
			return s += Ai.row, /* @__PURE__ */ g("g", {
				className: `kt-roster-item ${e.cls}`,
				transform: `translate(0,${n})`,
				children: [
					/* @__PURE__ */ h("title", { children: e.tip }),
					/* @__PURE__ */ h("rect", {
						x: -i / 2 + 8,
						y: -7.5,
						width: i - 8,
						height: 15,
						rx: 7.5
					}),
					/* @__PURE__ */ h("circle", {
						cx: -i / 2 + 18,
						cy: .5,
						r: 3.5
					}),
					/* @__PURE__ */ h("text", {
						x: -i / 2 + 28,
						y: 4.5,
						children: qn(e.text, 10)
					})
				]
			}, t);
		})]
	});
}
function Xa({ board: e, lay: t, head: n, focus: r, flash: i }) {
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
	return /* @__PURE__ */ g("g", {
		className: "kt-rail",
		"data-testid": "kt-rail",
		children: [
			/* @__PURE__ */ h("line", {
				className: "kt-rail-base",
				x1: a,
				y1: s,
				x2: o,
				y2: s
			}),
			u && /* @__PURE__ */ h("line", {
				className: "kt-rail-fill",
				x1: a,
				y1: s,
				x2: l ? o : n,
				y2: s
			}),
			/* @__PURE__ */ g("text", {
				className: "kt-rail-label",
				x: a,
				y: s - 18,
				children: ["运行分支 ", /* @__PURE__ */ h("tspan", {
					className: "kt-mono",
					children: e.branch ?? (e.row.state === "claimed" ? "（还没开工）" : cr(e) ? "（运行机还读不到）" : "（还不知道）")
				})]
			}),
			/* @__PURE__ */ g("text", {
				className: "kt-rail-sub",
				x: a,
				y: s + 24,
				children: [
					"从 ",
					/* @__PURE__ */ h("tspan", {
						className: "kt-mono",
						children: e.base
					}),
					" 出发",
					l ? /* @__PURE__ */ g(m, { children: ["，已合并回 ", /* @__PURE__ */ h("tspan", {
						className: "kt-mono",
						children: e.base
					})] }) : ""
				]
			}),
			[...c.entries()].map(([n, i]) => {
				let a = t.mergeX.get(n), o = e.actors.find((e) => e.key === n);
				return a === void 0 || !o ? null : /* @__PURE__ */ g("g", {
					className: `kt-rail-dot${n === "handover" ? " is-handover" : ""}${r && r !== n ? " is-dim" : ""}`,
					transform: `translate(${a},${s})`,
					children: [
						/* @__PURE__ */ h("title", { children: `${o.title}：${n === "handover" ? "交接提交" : `${i.n} 次提交`}，最后一次 ${i.last}` }),
						/* @__PURE__ */ h("circle", { r: 10 }),
						/* @__PURE__ */ h(Te, {
							role: o.icon,
							cx: 0,
							cy: 0,
							size: 13
						}),
						i.n > 1 && /* @__PURE__ */ g("text", {
							className: "kt-rail-n",
							x: 12,
							y: -10,
							children: ["×", i.n]
						})
					]
				}, n);
			}),
			l && /* @__PURE__ */ g("g", {
				className: "kt-rail-dot is-merge",
				transform: `translate(${o - 16},${s})`,
				children: [
					/* @__PURE__ */ h("title", { children: `合并进 ${e.base}` }),
					/* @__PURE__ */ h("circle", { r: 11 }),
					/* @__PURE__ */ h(Te, {
						role: "merge",
						cx: 0,
						cy: 0,
						size: 14
					})
				]
			}),
			i && /* @__PURE__ */ h("circle", {
				className: `kt-rail-flash is-${i.tone}`,
				cx: n,
				cy: s,
				r: 14
			}, i.n)
		]
	});
}
function Za({ board: e, lay: t, flash: n }) {
	let r = t.station, { passed: i, failed: a, total: o } = e.checks, s = r.r - 5, c = 2 * Math.PI * s, l = o ? i / o * c : 0, u = o ? a / o * c : 0;
	return /* @__PURE__ */ g("g", {
		className: `kt-station is-${o ? a ? "fail" : i === o ? "pass" : "part" : "none"}`,
		transform: `translate(${r.x},${r.y})`,
		"data-testid": "kt-station",
		role: "img",
		"aria-label": o ? `检查 ${i}/${o}` : "还没有检查结果",
		children: [
			/* @__PURE__ */ h("circle", {
				className: "kt-station-bg",
				r: r.r
			}),
			/* @__PURE__ */ h("circle", {
				className: "kt-station-track",
				r: s
			}),
			l > 0 && /* @__PURE__ */ h("circle", {
				className: "kt-station-pass",
				r: s,
				strokeDasharray: `${l} ${c}`,
				transform: "rotate(-90)"
			}),
			u > 0 && /* @__PURE__ */ h("circle", {
				className: "kt-station-fail",
				r: s,
				strokeDasharray: `${u} ${c}`,
				strokeDashoffset: -l,
				transform: "rotate(-90)"
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-station-num",
				y: 1,
				textAnchor: "middle",
				dominantBaseline: "central",
				children: o ? `${i}/${o}` : "—"
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-station-label",
				y: -r.r - 9,
				textAnchor: "middle",
				children: "检查"
			}),
			n && /* @__PURE__ */ h("circle", {
				className: `kt-station-flash is-${n.tone}`,
				r: r.r + 3
			}, n.n)
		]
	});
}
function Qa({ a: e, box: t, focus: n, flash: r, onActor: i, reducedMotion: a, quiet: o, onHover: s, mine: c, who: l }) {
	let u = Mn(e.status), d = Pn.has(e.status), f = e.status === "awaiting_approval", p = f && !c, m = [];
	f && m.push({
		text: c ? "等你" : l,
		tone: c ? "gate" : "other"
	}), e.status === "stalled" && m.push({
		text: "⚠ 卡住",
		tone: "warn"
	}), e.status === "queued" && m.push({
		text: "排队",
		tone: "queue"
	}), e.status === "fixing" && m.push({
		text: "返工",
		tone: "fix"
	}), e.line && c && m.push({
		text: "打一行",
		tone: "approve"
	});
	let _ = n === e.key, v = `${e.title}（${e.sub}）：${f ? c ? "等你" : l : u.label}，${e.doing}`, y = (t) => {
		(t.key === "Enter" || t.key === " ") && (t.preventDefault(), i(e.key));
	}, b = 84, x = !o && d && e.session?.busy ? "AI 在做" : null;
	return /* @__PURE__ */ g("g", {
		className: `kt-node is-${$a(e.status)}${p ? " is-other" : ""}${Nn(e.status) && e.status === "merged" ? " is-final" : ""}${n ? _ ? " is-focus" : " is-dim" : ""}`,
		transform: `translate(${t.x},${t.y})`,
		"data-role": e.key,
		"data-status": e.status,
		role: "button",
		tabIndex: 0,
		"aria-label": v,
		"aria-pressed": _,
		onClick: () => i(e.key),
		onKeyDown: y,
		onMouseEnter: () => s?.(!0),
		onMouseLeave: () => s?.(!1),
		children: [
			/* @__PURE__ */ h("title", { children: v }),
			(d || f && c) && /* @__PURE__ */ h(Fa, {
				w: 184,
				h: 80,
				reducedMotion: a
			}),
			/* @__PURE__ */ h("rect", {
				className: "kt-node-body",
				x: -92,
				y: -40,
				width: 184,
				height: 80,
				rx: 16
			}),
			e.status === "stalled" && /* @__PURE__ */ h("rect", {
				className: "kt-node-hatch",
				x: -92,
				y: -40,
				width: 184,
				height: 80,
				rx: 16,
				fill: "url(#kt-hatch)"
			}),
			e.status === "queued" && /* @__PURE__ */ h("rect", {
				className: "kt-node-ants",
				x: -96,
				y: -44,
				width: 192,
				height: 88,
				rx: 19
			}),
			/* @__PURE__ */ h("circle", {
				className: "kt-node-avatar",
				cx: -59,
				cy: 0,
				r: 22.5
			}),
			d && /* @__PURE__ */ h("circle", {
				className: "kt-node-spin",
				cx: -59,
				cy: 0,
				r: 27
			}),
			/* @__PURE__ */ h(Te, {
				role: e.icon,
				cx: -59,
				cy: 0,
				size: 24,
				className: "kt-node-emoji"
			}),
			/* @__PURE__ */ h("text", {
				className: `kt-node-title${e.title.length >= 5 ? " is-long" : ""}`,
				x: -26,
				y: -15,
				children: qn(e.title, 6.4)
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-node-task",
				x: -26,
				y: 4,
				children: qn(e.sub, 9.6)
			}),
			/* @__PURE__ */ h("text", {
				className: "kt-node-sub",
				x: -26,
				y: 23,
				children: eo(e, c)
			}),
			e.status === "merged" && /* @__PURE__ */ g("g", {
				className: "kt-node-check",
				transform: "translate(78,26)",
				children: [/* @__PURE__ */ h("circle", { r: 9 }), /* @__PURE__ */ h("path", { d: "M-4,0 L-1.2,3 L4.2,-3.2" })]
			}),
			e.status === "failed" && /* @__PURE__ */ g("g", {
				className: "kt-node-x",
				transform: "translate(78,26)",
				children: [/* @__PURE__ */ h("circle", { r: 9 }), /* @__PURE__ */ h("path", { d: "M-3.5,-3.5 L3.5,3.5 M3.5,-3.5 L-3.5,3.5" })]
			}),
			m.slice(0, 2).map((e) => {
				let t = Math.max(34, Math.round(to(e.text)) + 14);
				b -= t;
				let n = b;
				return b -= 4, /* @__PURE__ */ g("g", {
					className: `kt-node-badge is-${e.tone}`,
					transform: `translate(${n + t / 2},-40)`,
					children: [/* @__PURE__ */ h("rect", {
						x: -t / 2,
						y: -10,
						width: t,
						height: 20,
						rx: 10
					}), /* @__PURE__ */ h("text", {
						y: 4.5,
						textAnchor: "middle",
						children: e.text
					})]
				}, e.text);
			}),
			x && /* @__PURE__ */ g("text", {
				className: "kt-node-ticker",
				x: 0,
				y: 58,
				textAnchor: "middle",
				children: [
					"▸ ",
					x,
					e.credits === null ? "" : ` · ${Hn(e.credits)} credits`
				]
			}),
			r && /* @__PURE__ */ h("rect", {
				className: `kt-node-flash is-${r.tone}`,
				x: -97,
				y: -45,
				width: 194,
				height: 90,
				rx: 20
			}, r.n),
			/* @__PURE__ */ h("rect", {
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
var $a = (e) => e;
function eo(e, t) {
	let n = Mn(e.status), r = e.status === "merged" || e.status === "failed" ? 7.4 : 8.6;
	return e.status === "awaiting_approval" ? qn(t ? `✋ ${e.doing}` : e.doing, r) : e.status === "failed" ? qn(`✕ ${e.doing}`, r) : qn(e.doing || n.label, r);
}
function to(e) {
	let t = 0;
	for (let n of e) t += /[\u2e80-\u9fff\uff00-\uffef]/.test(n) ? 12.5 : n === " " ? 3.5 : 7.4;
	return t;
}
function no({ a: e, d: t, review: n, box: r, onAct: i }) {
	let a = `✋ ${n && t === "reply" ? Z.review : X[t] || X.answer}`, o = () => i?.(e.key, t);
	return /* @__PURE__ */ g("g", {
		className: `kt-gate-chip${i ? "" : " is-static"}`,
		transform: `translate(${r.x},${r.y + 40 + 22})`,
		role: i ? "button" : void 0,
		tabIndex: i ? 0 : void 0,
		"aria-label": `${e.title}：${a.slice(2)}`,
		onClick: o,
		onKeyDown: (e) => {
			(e.key === "Enter" || e.key === " ") && (e.preventDefault(), o());
		},
		"data-testid": "kt-wait-chip",
		children: [/* @__PURE__ */ h("rect", {
			x: -Math.max(54, to(a) / 2 + 12),
			y: -13,
			width: Math.max(108, to(a) + 24),
			height: 26,
			rx: 13
		}), /* @__PURE__ */ h("text", {
			y: 5,
			textAnchor: "middle",
			children: a
		})]
	});
}
var ro = [
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
		status: "other",
		text: "等别人"
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
function io({ handover: e, others: t }) {
	return /* @__PURE__ */ g("div", {
		className: "kt-legend",
		role: "note",
		"aria-label": "图例",
		children: [
			ro.map((e) => /* @__PURE__ */ g("span", {
				className: `kt-legend-item is-${e.status}`,
				"data-testid": e.status === "other" ? "kt-legend-other" : void 0,
				children: [/* @__PURE__ */ h("i", { "aria-hidden": "true" }), e.status === "other" && t.length ? t.join(" / ") : e.text]
			}, e.status)),
			/* @__PURE__ */ h("span", {
				className: "kt-legend-sep",
				"aria-hidden": "true"
			}),
			e && /* @__PURE__ */ g("span", {
				className: "kt-legend-item is-p-handoff",
				children: [/* @__PURE__ */ h("b", { "aria-hidden": "true" }), "交接 · 签名"]
			}),
			/* @__PURE__ */ g("span", {
				className: "kt-legend-item is-p-merge",
				children: [/* @__PURE__ */ h("b", { "aria-hidden": "true" }), "批准 · 回答"]
			}),
			/* @__PURE__ */ g("span", {
				className: "kt-legend-item is-p-pass",
				children: [/* @__PURE__ */ h("b", { "aria-hidden": "true" }), "检查全过"]
			}),
			/* @__PURE__ */ g("span", {
				className: "kt-legend-item is-p-fail",
				children: [/* @__PURE__ */ h("b", { "aria-hidden": "true" }), "退回 / 拦下 / 没过"]
			})
		]
	});
}
//#endregion
//#region src/board/CheckWall.tsx
function ao({ board: e, focus: t, onActor: n, flips: r, onSettings: i }) {
	let [a, o] = c(null), s = e.checks, l = s.cells.find((e) => e.id === a) ?? null, u = s.cells.filter((e) => e.status === "fail"), d = s.cells.filter((e) => e.status === "wait"), f = hr(s, e), p = f.green, _ = (t) => e.actors.find((e) => e.key === t.actor)?.icon, v = (t) => t.status === "wait" ? {
		...Xn.wait,
		label: Qn(e)
	} : Xn[t.status] ?? {
		label: t.status,
		glyph: "?"
	}, y = s.cells.filter((e) => e.group === "brain" && e.id.startsWith("kit") && e.status !== "pass");
	return /* @__PURE__ */ g("section", {
		className: `kt-card kt-wall${p ? " is-green" : ""}`,
		"data-testid": "kt-wall",
		"aria-label": "检查墙",
		children: [
			/* @__PURE__ */ g("header", {
				className: "kt-card-head",
				children: [
					/* @__PURE__ */ h("h2", { children: "检查墙" }),
					/* @__PURE__ */ g("span", {
						className: `kt-wall-score${p ? " tone-ok" : u.length ? " tone-bad" : ""}`,
						children: [
							s.passed,
							"/",
							s.total
						]
					}),
					/* @__PURE__ */ h("span", {
						className: "kt-wall-src",
						children: Yn.filter((e) => s.cells.some((t) => t.group === e.key)).map((e) => e.label).join(" · ")
					}),
					/* @__PURE__ */ h(oo, { at: s.at })
				]
			}),
			s.history.length > 1 && /* @__PURE__ */ g("div", {
				className: "kt-spark-row",
				children: [/* @__PURE__ */ h("span", {
					title: "每跑一次自动检查记一个点",
					children: "自动检查通过数"
				}), /* @__PURE__ */ h(so, { history: s.history })]
			}),
			s.history.length === 1 && /* @__PURE__ */ g("p", {
				className: "kt-dim br-small br-spark-one",
				children: [
					"自动检查跑了 1 次：",
					s.history[0].passed,
					" 项过了",
					s.history[0].failed ? `，${s.history[0].failed} 项没过` : ""
				]
			}),
			s.cells.length === 0 ? /* @__PURE__ */ h("p", {
				className: "kt-dim kt-wall-empty",
				children: "还没有检查：开工以后，Lean 的审批和自动检查都会记在这里"
			}) : /* @__PURE__ */ h("div", {
				className: "kt-wall-grid",
				children: Yn.map((e) => {
					let i = s.cells.filter((t) => t.group === e.key);
					return i.length ? /* @__PURE__ */ g("div", {
						className: "kt-ac is-multi br-wall-group",
						role: "group",
						"aria-label": e.label,
						children: [/* @__PURE__ */ h("div", {
							className: "kt-group-label",
							children: e.label
						}), /* @__PURE__ */ h("div", {
							className: "kt-ac-cells",
							children: i.map((e) => {
								let i = r[e.id] ?? 0, a = v(e);
								return /* @__PURE__ */ h("button", {
									type: "button",
									className: `kt-cell is-${e.status}${t ? e.actor === t ? " is-hot" : " is-dim" : ""}`,
									"data-testid": "kt-cell",
									"data-case": e.id,
									"data-status": e.status,
									"aria-label": `${e.name}：${a.label}，${e.detail}`,
									onMouseEnter: () => o(e.id),
									onMouseLeave: () => o((t) => t === e.id ? null : t),
									onFocus: () => o(e.id),
									onBlur: () => o((t) => t === e.id ? null : t),
									onClick: () => e.actor && n(e.actor),
									children: /* @__PURE__ */ g("span", {
										className: `kt-cell-face${i ? " is-flip" : ""}`,
										children: [
											/* @__PURE__ */ h("span", {
												className: "kt-cell-ac",
												children: e.label
											}),
											/* @__PURE__ */ h("span", {
												className: "kt-cell-glyph",
												"aria-hidden": "true",
												children: a.glyph
											}),
											_(e) && /* @__PURE__ */ h("span", {
												className: "kt-cell-owner",
												"aria-hidden": "true",
												children: /* @__PURE__ */ h(Y, {
													role: _(e),
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
			s.cells.length > 0 && /* @__PURE__ */ h("div", {
				className: `kt-wall-inspect${l ? ` is-${l.status}` : u.length ? " is-fail" : ""}`,
				"data-testid": "kt-inspect",
				children: l ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("strong", { children: [
					v(l).glyph,
					" ",
					l.name
				] }), /* @__PURE__ */ h("span", { children: l.detail })] }) : u.length ? /* @__PURE__ */ g("span", { children: [
					/* @__PURE__ */ h("strong", {
						className: "tone-bad",
						children: f.text
					}),
					" · 没过的是 ",
					u.map((e) => e.label).join("、"),
					/* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: " · 悬停或聚焦格子看原因"
					})
				] }) : d.length ? /* @__PURE__ */ g("span", { children: [
					/* @__PURE__ */ h("strong", {
						className: `tone-${f.tone}`,
						children: f.text
					}),
					" · 等的是 ",
					d.map((e) => e.label).join("、"),
					/* @__PURE__ */ h("span", {
						className: "kt-dim",
						children: " · 悬停看要做什么"
					})
				] }) : /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ g("strong", {
					className: `tone-${f.tone}`,
					children: [f.text, p ? " ✓" : ""]
				}), !p && /* @__PURE__ */ h("span", {
					className: "kt-dim",
					children: " · 悬停看每一格"
				})] })
			}),
			y.length > 0 && i && /* @__PURE__ */ g("p", {
				className: "br-wall-fix",
				"data-testid": "kt-wall-fix",
				children: [/* @__PURE__ */ h("span", { children: y.some((e) => e.status === "fail" || e.status === "wait") ? `仓库的 kit 有 ${y.length} 处要修` : `仓库的 kit 有 ${y.length} 处提醒（现在不碍事）` }), /* @__PURE__ */ h("button", {
					type: "button",
					className: "br-link",
					onClick: i,
					children: "去设置修 ›"
				})]
			})
		]
	});
}
function oo({ at: e }) {
	let t = bi();
	return /* @__PURE__ */ h("span", {
		className: "kt-dim kt-wall-at",
		children: e ? `${Vn(t - e)}更新` : "还没有结果"
	});
}
function so({ history: e }) {
	if (!e.length) return null;
	let t = e[0].at, n = e[e.length - 1].at, r = Math.max(1, ...e.map((e) => e.passed + e.failed)), i = (e) => n > t ? 5 + (e - t) / (n - t) * 290 : 150, a = (e) => 35 - e / r * 30, o = `M${i(e[0].at).toFixed(1)},${a(e[0].passed).toFixed(1)}`;
	for (let t = 1; t < e.length; t++) o += ` H${i(e[t].at).toFixed(1)} V${a(e[t].passed).toFixed(1)}`;
	let s = e[e.length - 1], c = `${o} V35 H${i(e[0].at).toFixed(1)} Z`;
	return /* @__PURE__ */ g("svg", {
		className: "kt-spark",
		viewBox: "0 0 300 40",
		role: "img",
		"aria-label": `自动检查通过数：${e.map((e) => `${e.passed}/${e.passed + e.failed}`).join(" → ")}`,
		children: [
			/* @__PURE__ */ h("line", {
				className: "kt-spark-total",
				x1: 0,
				x2: 300,
				y1: a(r),
				y2: a(r)
			}),
			/* @__PURE__ */ h("path", {
				className: "kt-spark-area",
				d: c
			}),
			/* @__PURE__ */ h("path", {
				className: "kt-spark-line",
				d: o
			}),
			e.map((t, n) => /* @__PURE__ */ h("circle", {
				className: t.failed ? "kt-spark-pt is-fail" : "kt-spark-pt is-pass",
				cx: i(t.at),
				cy: a(t.passed),
				r: n === e.length - 1 ? 3.4 : 2.2,
				children: /* @__PURE__ */ h("title", { children: `${t.passed}/${t.passed + t.failed}` })
			}, n)),
			/* @__PURE__ */ h("text", {
				className: "kt-spark-label",
				x: Math.min(298, i(s.at)),
				y: Math.max(9, a(s.passed) - 6),
				textAnchor: "end",
				children: s.passed
			})
		]
	});
}
var co = (e) => `${e.row.repo}/${e.row.key}`, lo = (e) => e.events.reduce((e, t) => Math.max(e, t.seq), 0), uo = (e) => `${e.kind}@${e.sha}@${e.at}`, fo = (e, t) => `${e}#${t}`;
function po(e, t) {
	return e ? e === "person" ? ra : e === "branch" ? "run" : e === "checks" ? na : t.has(e) ? e : null : null;
}
var mo = {
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
function ho(e, t, n, r) {
	let i = {
		key: fo(t, e.seq),
		t: e.at,
		kind: e.kind
	}, a = po(e.from, n), o = po(e.to, n), s = (t, n, r, a, o = mo[e.kind] ?? null) => {
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
				to: na,
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
function go(e, t, n) {
	let r = fo(t, e.seq), i = po(e.to, n) ?? po(e.from, n);
	switch (e.kind) {
		case "reject":
		case "rejected":
		case "refused": return i ? [{
			key: r,
			target: i,
			tone: "bad",
			kind: e.kind
		}] : [];
		case "blocked": return po(e.from, n) ? [{
			key: r,
			target: po(e.from, n),
			tone: "bad",
			kind: e.kind
		}] : [];
		case "verify": return /没过/.test(e.text) ? [{
			key: r,
			target: na,
			tone: "bad",
			kind: e.kind
		}] : [];
		default: return [];
	}
}
function _o(e) {
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
function vo(e, t, n = {}) {
	let r = n.lateS ?? 30, i = n.max ?? 24, a = co(t);
	if (!e || co(e) !== a || n.resync) return _o(a);
	let o = lo(e);
	if (lo(t) < o) return _o(a);
	let s = new Set(t.actors.map((e) => e.key)), c = t.events.filter((e) => e.seq > o).sort((e, t) => e.seq - t.seq), l = [], u = [], d = t.checks.cells.filter((e) => e.group === "verify"), f = d.length ? {
		passed: d.filter((e) => e.status === "pass").length,
		total: d.length
	} : null;
	for (let e of c) {
		if (n.at !== void 0 && n.at - e.at > r) continue;
		let t = ho(e, a, s, e.kind === "verify" ? f : null);
		t && l.push(t), u.push(...go(e, a, s));
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
		target: na,
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
	})), _ = new Set(e.belt.map(uo)), v = t.belt.map(uo).filter((e) => !_.has(e));
	return {
		req: a,
		first: !1,
		fresh: c,
		items: l,
		flashes: u,
		flips: m,
		belt: v,
		actors: g,
		announce: yo(e, t, c)
	};
}
function yo(e, t, n) {
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
function bo(e) {
	if (e.source === "trace") return "运行分支上还没有提交";
	if (e.row.where === "runner" && !e.row.worktree) {
		let t = e.actors.find((e) => e.key === "runner")?.status;
		return t === "waiting" || t === "queued" ? `运行机还没开始做，还没有它的提交：${e.row.waits.text}` : "运行机的工作目录不在这台机器上，这里读不到它的提交";
	}
	return "这里读不到运行分支的提交：brain-kit 没读出这个需求的记录";
}
function xo({ board: e, fresh: t, focus: n, onActor: r }) {
	let a = bi(), o = s(null), [l, u] = c(!1);
	i(() => {
		let e = o.current;
		e && (e.scrollLeft = e.scrollWidth, u(e.scrollLeft > 4));
	}, [e.belt.length]);
	let d = new Map(e.actors.map((e) => [e.key, e])), f = e.belt.filter((e) => e.kind === "commit"), p = f.filter((e) => e.by === "bot").length, _ = e.belt.some((e) => e.kind === "merge"), v = e.events.filter((e) => e.kind === "commit" && e.from === "person").length;
	return /* @__PURE__ */ g("section", {
		className: "kt-card kt-conveyor",
		"data-testid": "kt-conveyor",
		"aria-label": "提交传送带",
		children: [/* @__PURE__ */ g("header", {
			className: "kt-card-head",
			children: [/* @__PURE__ */ h("h2", { children: "提交传送带" }), /* @__PURE__ */ g("span", {
				className: "kt-dim",
				children: [
					f.length,
					" 次提交",
					p ? ` · 运行机 ${p} 次` : "",
					e.belt.some((e) => e.kind === "handover") ? " · 交接 1 次" : "",
					_ ? " · 已合并" : "",
					v ? /* @__PURE__ */ g(m, { children: [" · ", /* @__PURE__ */ g("span", {
						className: "tone-warn",
						children: [
							"交接后有人推了 ",
							v,
							" 次"
						]
					})] }) : null
				]
			})]
		}), e.belt.length === 0 ? /* @__PURE__ */ g("p", {
			className: "kt-dim kt-wall-empty",
			children: [bo(e), e.source !== "trace" && e.row.mr && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ h(dt, {
				href: e.row.mr.url,
				children: Z.viewMr
			})] })]
		}) : /* @__PURE__ */ g("ol", {
			className: `kt-belt${l ? " has-older" : ""}`,
			ref: o,
			onScroll: (e) => u(e.currentTarget.scrollLeft > 4),
			children: [
				/* @__PURE__ */ g("li", {
					className: "kt-belt-end is-base",
					title: "运行分支从这里出发",
					children: ["从 ", /* @__PURE__ */ h("code", { children: e.base })]
				}),
				e.belt.map((i) => {
					let o = uo(i), s = d.get(i.actor), c = i.kind === "handover" ? " is-handover" : i.kind === "merge" ? " is-merge" : i.by === "bot" ? " is-bot" : "";
					return /* @__PURE__ */ g("li", {
						className: `kt-belt-chip${c}${t.has(o) ? " is-new" : ""}${n && n !== i.actor ? " is-dim" : ""}`,
						children: [
							/* @__PURE__ */ g("button", {
								type: "button",
								className: "kt-belt-role",
								onClick: () => r(i.actor),
								title: i.text,
								children: [
									/* @__PURE__ */ h(Y, {
										role: i.kind === "merge" ? "merge" : i.kind === "handover" ? "handover" : s?.icon ?? "commit",
										size: 14
									}),
									" ",
									i.kind === "merge" ? `合并进 ${e.base}` : i.kind === "handover" ? "交接" : i.by === "bot" ? "运行机" : "本机"
								]
							}),
							/* @__PURE__ */ g("span", {
								className: "kt-belt-meta",
								children: [
									i.sha && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("code", { children: i.sha.slice(0, 8) }), " · "] }),
									i.files ? `${i.files} 个文件 · ` : "",
									Vn(a - i.at)
								]
							}),
							i.kind === "commit" && /* @__PURE__ */ g("span", {
								className: "kt-belt-text",
								children: [i.text, i.records_only ? "（只改记录）" : ""]
							})
						]
					}, o);
				}),
				/* @__PURE__ */ h("li", {
					className: `kt-belt-end is-head${_ ? " is-merged" : ""}`,
					title: _ ? "已合并进默认分支" : "运行分支的最新提交",
					children: /* @__PURE__ */ h("code", { children: _ ? e.base : e.branch ?? "运行分支" })
				})
			]
		})]
	});
}
//#endregion
//#region src/board/EventFeed.tsx
function So({ board: e, focus: t, onActor: n, fresh: r }) {
	let i = bi(), [a, o] = c(!0), s = new Map(e.actors.map((e) => [e.key, e])), l = e.events.slice().reverse().filter((e) => (a || !e.detail) && (!t || Jn(e, t))), u = t ? s.get(t) : void 0;
	return /* @__PURE__ */ g("section", {
		className: "kt-card kt-feed",
		"data-testid": "kt-feed",
		"aria-label": "事件",
		children: [/* @__PURE__ */ g("header", {
			className: "kt-card-head",
			children: [
				/* @__PURE__ */ h("h2", { children: "事件" }),
				/* @__PURE__ */ h("span", {
					className: "kt-dim",
					children: e.source === "trace" ? "来自 brain-kit 的记录" : "来自 Lean 的记录"
				}),
				u && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-filter",
					onClick: () => n(u.key),
					"aria-label": `不再只看${u.title}`,
					children: [
						"只看 ",
						/* @__PURE__ */ h(Y, {
							role: u.icon,
							size: 14
						}),
						" ",
						u.title,
						" ✕"
					]
				}),
				/* @__PURE__ */ g("label", {
					className: "kt-check",
					children: [/* @__PURE__ */ h("input", {
						type: "checkbox",
						checked: a,
						onChange: (e) => o(e.target.checked)
					}), "Lean 细节"]
				})
			]
		}), /* @__PURE__ */ g("ol", {
			className: "kt-feed-list",
			children: [l.length === 0 && /* @__PURE__ */ h("li", {
				className: "kt-dim kt-feed-empty",
				children: t ? "这一环还没有事件" : "还没有事件"
			}), l.map((t) => {
				let a = In[t.kind] ?? {
					icon: "•",
					label: t.kind,
					tone: "idle"
				};
				return /* @__PURE__ */ g("li", {
					className: `kt-ev is-${t.kind} tone-${a.tone}${r.has(t.seq) ? " is-new" : ""}${t.detail ? " is-tool" : ""}`,
					"data-seq": t.seq,
					title: t.src ?? void 0,
					children: [
						/* @__PURE__ */ h("span", {
							className: "kt-ev-icon",
							"aria-hidden": "true",
							title: a.label,
							children: a.icon
						}),
						/* @__PURE__ */ h("span", {
							className: "kt-ev-text",
							children: t.text
						}),
						/* @__PURE__ */ h(Co, {
							e: t,
							board: e,
							byKey: s,
							onActor: n
						}),
						/* @__PURE__ */ h("time", {
							className: "kt-ev-time",
							dateTime: (/* @__PURE__ */ new Date(t.at * 1e3)).toISOString(),
							title: Wn(t.at),
							children: Vn(i - t.at)
						})
					]
				}, t.seq);
			})]
		})]
	});
}
function Co({ e, board: t, byKey: n, onActor: r }) {
	let i = (i) => {
		if (!i) return null;
		let a = n.get(i), o = i === "person" ? zn(e, t) : Ln[i];
		return a ? /* @__PURE__ */ h("button", {
			type: "button",
			className: "kt-ev-role",
			onClick: () => r(a.key),
			title: `只看${a.title}`,
			"aria-label": `只看${a.title}`,
			children: /* @__PURE__ */ h(Y, {
				role: a.icon,
				size: 15
			})
		}, a.key) : o ? /* @__PURE__ */ h("span", {
			className: "kt-ev-place",
			"data-testid": "kt-ev-place",
			children: o
		}, i) : null;
	};
	return e.from && e.to && e.from !== e.to ? /* @__PURE__ */ g("span", {
		className: "kt-ev-roles",
		children: [
			i(e.from),
			/* @__PURE__ */ h("span", {
				"aria-hidden": "true",
				children: "→"
			}),
			i(e.to)
		]
	}) : /* @__PURE__ */ h("span", {
		className: "kt-ev-roles",
		children: i(e.from ?? e.to)
	});
}
//#endregion
//#region src/board/extra.ts
var wo = "\n.br-board .kt-orch.br-person .kt-orch-title { font-size: 17px; }\n.br-board .kt-orch.br-person.is-awaiting_approval .kt-orch-body { fill: color-mix(in srgb, var(--kt-approve) 13%, var(--card)); stroke: var(--kt-approve); stroke-width: 3; }\n.br-board .kt-orch.br-person.is-awaiting_approval .kt-node-halo { stroke: var(--kt-approve); animation: kt-beacon 1.1s ease-in-out infinite; }\n.br-board .kt-orch.br-person.is-merged .kt-orch-body { fill: color-mix(in srgb, var(--kt-ok) 10%, var(--card)); stroke: var(--kt-ok); }\n.br-board .kt-orch.br-person.is-waiting .kt-orch-body { stroke: color-mix(in srgb, var(--muted) 55%, transparent); }\n.br-board .kt-orch-sub.is-wait { fill: var(--kt-approve); font-weight: 800; }\n.br-board .kt-node-x circle { fill: #fff; }\n.br-board .kt-node-x path { fill: none; stroke: var(--kt-bad-solid); stroke-width: 2.4; stroke-linecap: round; }\n.br-board .kt-node.is-done .kt-node-sub { fill: var(--kt-ok); }\n.br-board .kt-node.is-awaiting_approval .kt-node-task, .br-board .kt-node.is-failed .kt-node-task { fill: var(--text); }\n.br-board .kt-node.is-failed .kt-node-task { fill: #fff; fill-opacity: .85; }\n.br-board .kt-node.is-merged .kt-node-task { fill: #fff; fill-opacity: .8; }\n.br-board .kt-rail-dot.is-handover circle { fill: var(--kt-handoff); }\n.br-board .kt-rail-dot.is-merge circle { fill: var(--kt-ok-solid); stroke: var(--kt-ok); stroke-width: 2.5; }\n.br-board .kt-rail-dot .kt-role-icon { color: #fff; }\n.br-board .kt-rail-n { fill: var(--muted); font-size: 11px; font-weight: 800; }\n.br-board .kt-station.is-part .kt-station-bg { stroke: color-mix(in srgb, var(--kt-approve) 60%, transparent); }\n.br-board .kt-gate-chip text { fill: #fff; }\n\n/* the check wall: a cell that waits for a person is magenta, like everything that waits for one */\n.br-board .kt-cell.is-wait { --kt-c: var(--kt-approve); }\n.br-board .kt-cell.is-wait .kt-cell-face { border-style: solid; animation: kt-blink 2.4s ease-in-out infinite; }\n.br-board .kt-wall-inspect.is-wait { background: color-mix(in srgb, var(--kt-approve) 9%, transparent); }\n.br-board .br-wall-group .kt-ac-cells { flex-wrap: wrap; }\n.br-board .kt-cell-ac { overflow: hidden; text-overflow: ellipsis; max-width: 100%; }\n.kt-segs i.is-wait { background: var(--kt-approve); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-approve) 50%, transparent); }\n.kt-segs i.is-run { background: var(--kt-run); box-shadow: 0 0 8px color-mix(in srgb, var(--kt-run) 55%, transparent); }\n\n/* the lanes: work, waits for a person, work done again */\n.br-board .kt-track-span.is-wait { background: color-mix(in srgb, var(--kt-approve) 60%, transparent); }\n.br-board .kt-track-span.is-wait.is-live { background: var(--kt-approve); box-shadow: 0 0 10px color-mix(in srgb, var(--kt-approve) 70%, transparent); }\n.br-board .kt-track-span.is-fix { background: color-mix(in srgb, var(--kt-fix) 70%, transparent); }\n.br-board .kt-track-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: var(--kt-ok); }\n.br-board .kt-track-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: var(--kt-bad); }\n.br-board .kt-track-mark:is(.is-request, .is-question) { background: var(--kt-approve); }\n.br-board .kt-track-mark:is(.is-handover, .is-signed) { background: var(--kt-handoff); }\n.br-board .kt-track-mark.is-blocked { background: var(--kt-warn); }\n.br-board .kt-track-mark.is-commit { top: 4px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--text-strong); box-shadow: 0 0 0 2px var(--card); }\n.br-board .kt-track-mark.is-session { background: var(--kt-run); }\n.br-board .br-fact { color: var(--text); }\n.br-board .br-facts-chips li { max-width: none; }\n.br-board .br-mark { padding: 0 6px; border-radius: 6px; font-family: var(--font-body, sans-serif); font-weight: 750; font-size: .95em;\n  background: color-mix(in srgb, var(--muted) 16%, transparent); color: var(--text-strong) !important; }\n.br-board .br-mark:is(.is-approved, .is-answer, .is-accepted, .is-verify-ok, .is-reflect) { background: color-mix(in srgb, var(--kt-ok) 18%, transparent); }\n.br-board .br-mark:is(.is-rejected, .is-refused, .is-verify-fail) { background: color-mix(in srgb, var(--kt-bad) 18%, transparent); }\n.br-board .br-mark:is(.is-request, .is-question) { background: color-mix(in srgb, var(--kt-approve) 18%, transparent); }\n.br-board .br-mark:is(.is-handover, .is-signed) { background: color-mix(in srgb, var(--kt-handoff) 20%, transparent); }\n.br-board .kt-lane .br-line { margin-top: 2px; }\n\n/* the conveyor */\n.br-board .kt-belt-chip.is-handover { border: 1px solid color-mix(in srgb, var(--kt-handoff) 60%, var(--border)); background: color-mix(in srgb, var(--kt-handoff) 12%, var(--card)); }\n.br-board .kt-belt-chip.is-bot { border-color: color-mix(in srgb, var(--kt-run) 50%, var(--border)); background: color-mix(in srgb, var(--kt-run) 9%, var(--card)); }\n.br-board .kt-belt-chip.is-merge { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); }\n.br-board .kt-belt-chip.is-merge :is(.kt-belt-role, .kt-belt-meta, .kt-belt-meta code) { color: #fff; }\n.br-board .kt-belt-text { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .8em; color: var(--text); }\n.br-board .kt-belt-end.is-head.is-merged { background: var(--kt-ok-solid); color: #fff; border-color: var(--kt-ok-solid); }\n.br-board .kt-belt-end.is-head.is-merged code { color: #fff; }\n\n/* the counters: one row as long as the app is wide enough (its own width, not the window's: the KiroCrew sidebar) */\n.br-board .br-kpis { grid-template-columns: minmax(0, 1fr) minmax(0, 1.35fr) minmax(0, 1.1fr) minmax(0, 1.05fr) minmax(0, .7fr); }\n.br-board .br-kpis > * { grid-column: auto; order: 0; }\n@container kt-root (max-width: 860px) { .br-board .br-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } .br-board .br-kpis > * { grid-column: span 2; } .br-board .br-kpis > :nth-child(n+4) { grid-column: span 3; } }\n@container kt-root (max-width: 560px) { .br-board .br-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .br-board .br-kpis > *, .br-board .br-kpis > :nth-child(n+4) { grid-column: auto; } }\n.br-board .kt-kpi-note { white-space: normal; overflow: visible; word-break: keep-all; overflow-wrap: break-word; }\n.br-board .br-lean-next b { color: var(--kt-approve); }\n.kt-segs i.is-skip { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 38%, transparent) 0 3px, transparent 3px 6px); }\n.kt-segs i.is-next { background: color-mix(in srgb, var(--kt-approve) 30%, transparent); box-shadow: inset 0 0 0 2px var(--kt-approve); }\n.kt-segs i.is-watch { background: color-mix(in srgb, var(--kt-info) 60%, transparent); }\n.br-board .kt-kpi.is-warn { border-color: var(--kit-wait); }\n.br-dots { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; min-height: 12px; }\n.br-dots i { width: 12px; height: 12px; border-radius: 4px; }\n.br-dots i.is-point { background: var(--kt-ok); box-shadow: 0 0 6px color-mix(in srgb, var(--kt-ok) 55%, transparent); }\n.br-dots i.is-out { background: var(--kt-warn); }\n.br-board .kt-gates-rows { margin-top: 4px; }\n\n/* the event feed's places (你, 运行分支, 检查) */\n.br-board .kt-ev-place { padding: 0 5px; border-radius: 7px; border: 1px dashed var(--border-strong, var(--border)); font-size: 12px; color: var(--muted); }\n\n/* 验收 */\n.br-board .kt-sign.is-idle { border-color: var(--border); }\n.br-board .kt-sign-head .kt-pill { align-self: center; }\n.br-board .kt-sign-grid dd { color: var(--text-strong); }\n.br-board .br-accept-desc dt { display: flex; align-items: center; gap: 8px; }\n.br-board .br-accept-desc dd > span { font-weight: 650; }\n.br-step { display: grid; gap: 8px; margin-top: 10px; padding: 12px 14px; border-radius: 12px; border: 1px solid var(--kit-wait);\n  background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }\n.br-step p { margin: 0; }\n.br-step-who { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--kt-approve); font-size: .9em; }\n.br-extbtn { text-decoration: none; }\n.br-board .br-board-qs { display: grid; gap: 10px; }\n.br-board .kt-sign-blocked { font-size: .95em; }\n\n/* the introduction: five phases (four for a repo done only here) in a row while they fit, the next row when they do\n   not; a card never gets narrower than its words, which break only after a 、 (never inside a word) */\n.br-way.kt-team-intro.is-phased { display: flex; flex-wrap: wrap; }\n.br-way .kt-intro-phase { flex: 1 1 auto; }\n.br-way .kt-intro-phase-body > .kt-intro-stage { flex: 1 0 auto; min-width: auto; }\n.br-way .kt-intro-role { grid-template-columns: 36px minmax(min-content, 1fr); }\n.br-board .kt-intro-name b { white-space: nowrap; }\n.br-board .kt-intro-does { overflow-wrap: normal; }\n.br-board .kt-intro-does .br-phrase { display: inline-block; white-space: nowrap; }\n/* a requirement the repo does not have: the same card as 需求详情's */\n.br-board .br-notfound { padding: 16px 20px; border: 1px solid var(--border); border-radius: 16px; background: var(--card); max-width: 720px; }\n.br-board .br-notfound h3 { margin: 0 0 6px; }\n/* a step said on two lines (what happened, then what to do) keeps its lines */\n.br-next .br-pre-line { white-space: pre-line; }\n.br-btn-big { padding: 10px 20px; font-size: 1.02em; border-radius: 12px; }\n\n/* whom it waits for: magenta is the person looking only; anyone else is a calm blue, no blinking */\n.br-board .kt-orch.br-person.is-other .kt-orch-body { fill: color-mix(in srgb, var(--kt-info) 9%, var(--card)); stroke: var(--kt-info); stroke-width: 2.5; }\n.br-board .kt-orch-sub.is-other { fill: var(--kt-info); font-weight: 750; }\n.br-board .kt-orch.br-person { cursor: default; }\n.br-board .kt-node.is-awaiting_approval.is-other .kt-node-body { stroke: var(--kt-info); stroke-width: 2.5; fill: color-mix(in srgb, var(--kt-info) 9%, var(--card)); }\n.br-board .kt-node.is-awaiting_approval.is-other .kt-node-sub { fill: var(--kt-info); }\n.kt-node-badge.is-other { --kt-badge: var(--kt-info); }\n.kt-legend-item.is-other i { border-color: var(--kt-info); background: color-mix(in srgb, var(--kt-info) 16%, transparent); }\n.br-board .kt-track-span.is-wait.is-other { background: color-mix(in srgb, var(--kt-info) 55%, transparent); }\n.br-board .kt-track-span.is-wait.is-other.is-live { background: var(--kt-info); box-shadow: none; }\n.br-board .kt-track-span.is-wait.is-other.is-live::after { display: none; }\n\n/* the graph keeps its text readable: an app too narrow for its six columns gets one column per phase (layout.ts\n   graphShape); narrower still, it scrolls the graph sideways and the hidden part's edge fades and says so */\n.br-graph-view { position: relative; }\n/* its smallest words are 12 px too, so at that scale nothing on the graph is under 10 px (BOARD-31) */\n.br-board .kt-graph-svg :is(.kt-orch-sub, .kt-rail-n, .kt-phase-stages, .kt-roster-title, .kt-roster-item text) { font-size: 12px; }\n.br-graph-scroll { overflow-x: auto; overflow-y: hidden; scrollbar-width: thin; }\n.br-graph-view::before, .br-graph-view::after { content: ''; position: absolute; top: 0; bottom: 0; width: 56px; pointer-events: none; opacity: 0; transition: opacity .2s; z-index: 2; }\n.br-graph-view::before { left: 0; background: linear-gradient(90deg, var(--card), transparent); }\n.br-graph-view::after { right: 0; background: linear-gradient(270deg, var(--card), transparent); }\n.br-graph-view.has-left::before, .br-graph-view.has-right::after { opacity: 1; }\n.br-graph-more { position: absolute; top: 50%; transform: translateY(-50%); z-index: 3; padding: 5px 11px; border-radius: 999px; font: inherit; font-size: 12.5px; font-weight: 750; cursor: pointer;\n  color: var(--text-strong); background: var(--card); border: 1px solid var(--border-strong, var(--border)); box-shadow: 0 2px 10px rgba(0, 0, 0, .25); }\n.br-graph-more:hover { border-color: var(--accent); }\n.br-graph-more.is-right { right: 10px; }\n.br-graph-more.is-left { left: 10px; }\n\n/* a phase not on the way, folded to a narrow band */\n.br-board .kt-phase.is-folded .kt-phase-title { font-size: 14px; }\n.br-board .kt-phase.is-folded .kt-phase-band { fill: color-mix(in srgb, var(--muted) 5%, transparent); }\n\n/* the check wall: watching (the 14 days, nobody's turn) and not needed this time */\n.br-board .kt-cell.is-watch { --kt-c: var(--kt-info); }\n.br-board .kt-cell.is-watch .kt-cell-face { color: var(--kt-info); }\n.br-board .kt-wall-inspect.is-watch { background: color-mix(in srgb, var(--kt-info) 9%, transparent); }\n.br-board .kt-cell.is-not_needed { --kt-c: var(--muted); opacity: .6; }\n.br-board .kt-cell.is-not_needed .kt-cell-face { border-style: dotted; background: none; color: var(--muted); }\n.br-wall-fix { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin: 8px 0 0; font-size: .86em; color: var(--muted); }\n.br-wall-fix .br-link { font-weight: 750; }\n.br-spark-one { margin: -2px 0 8px; }\n\n/* the lanes: the quiet tail drawn short, the change block */\n.br-board .kt-axis .kt-axis-tick { transform: translateX(-50%); white-space: nowrap; }\n.br-board .kt-axis .kt-axis-tick.is-first { transform: none; }\n.br-board .kt-axis .kt-axis-tick.is-last { transform: translateX(-100%); }\n.kt-axis-tail { position: absolute; top: 0; padding-left: 6px; border-left: 2px dotted color-mix(in srgb, var(--muted) 55%, transparent); font-size: .76em; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.kt-track-tail { position: absolute; top: 0; height: 14px; border-left: 2px dotted color-mix(in srgb, var(--muted) 55%, transparent);\n  background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 12%, transparent) 0 4px, transparent 4px 8px); }\n.br-changes { display: grid; gap: 4px; min-width: 0; }\n.br-commit-rows li { align-items: center; }\n.br-commit-rows li .br-commit-subj { flex: 1 1 auto; }\n.br-commit-rows li.is-records .br-commit-subj { color: var(--muted); }\n.br-commit-rows .br-commit-files { flex: none; display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }\n.br-commit-rows .br-commit-files .kt-file-bar { width: 56px; }\n.br-board .kt-owned { margin-top: 2px; }\n\n/* 你要做的一步: the strip above the graph */\n.br-next { display: grid; gap: 8px; padding: 10px 14px; border-radius: 14px; border: 1px solid var(--kit-wait, var(--kt-approve));\n  background: color-mix(in srgb, var(--kt-approve) 7%, var(--card)); }\n.br-next-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n.br-next-who { display: inline-flex; align-items: center; gap: 6px; font-weight: 800; color: var(--kt-approve); white-space: nowrap; }\n.br-next-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }\n.br-next-item + .br-next-item { border-top: 1px dashed color-mix(in srgb, var(--kt-approve) 30%, var(--border)); padding-top: 8px; }\n.br-next-row { display: flex; align-items: center; gap: 8px 14px; flex-wrap: wrap; }\n.br-next-text { flex: 1 1 340px; min-width: 0; display: grid; gap: 4px; }\n.br-next-text p { margin: 0; }\n.br-next-text .br-line { margin-top: 2px; }\n.br-next-acts { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }\n.br-next-k { display: inline-block; min-width: 5.2em; margin-right: 8px; color: var(--muted); font-size: .88em; }\n.br-next-hint { color: var(--text); }\n.br-next-cmd { display: flex; align-items: center; gap: 6px 8px; flex-wrap: wrap; }\n.br-next-cmd code { padding: 2px 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--kt-glass); }\n.br-next-cwd { font-size: .8em; overflow-wrap: anywhere; }\n.br-next .br-q { margin: 0; }\n.br-next.is-other { display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; margin: 0; padding: 8px 14px; border-color: var(--border); background: var(--card); }\n.br-next.is-other .br-next-who { color: var(--muted); font-weight: 700; }\n\n/* 验收's small parts; the board's problem said with what to do */\n.br-board .br-copy { display: inline-flex; align-items: center; gap: 3px; white-space: nowrap; }\n.br-board .br-desc-ref { cursor: help; }\n.br-board .br-problem { display: grid; gap: 4px; }\n";
//#endregion
//#region src/board/NextStep.tsx
function To({ board: e, repo: t, reqKey: n, onAnswered: r, onBrain: i, onDetail: a }) {
	let o = Aa(e), s = bi(), c = e.row.state;
	return o.mine ? o.steps.length ? /* @__PURE__ */ g("section", {
		id: "br-next",
		className: "br-next",
		"aria-label": "你要做的一步",
		"data-testid": "br-next",
		children: [/* @__PURE__ */ g("header", {
			className: "br-next-head",
			children: [
				/* @__PURE__ */ g("span", {
					className: "br-next-who",
					children: [/* @__PURE__ */ h(Y, {
						role: "person",
						size: 16
					}), "你要做的一步"]
				}),
				o.steps.length > 1 && /* @__PURE__ */ g("span", {
					className: "kt-pill tone-approve",
					children: [o.steps.length, " 件事等你"]
				}),
				o.since !== null && /* @__PURE__ */ g("span", {
					className: "kt-dim",
					children: ["已经等了 ", Bn(s - o.since)]
				})
			]
		}), /* @__PURE__ */ h("ol", {
			className: "br-next-list",
			children: o.steps.map((s) => /* @__PURE__ */ h("li", {
				className: `br-next-item is-${s.do}`,
				"data-testid": "br-next-step",
				"data-do": s.do,
				children: s.question ? /* @__PURE__ */ h(Eo, {
					s,
					open: o.steps.length === 1,
					repo: t,
					reqKey: n,
					onAnswered: r
				}) : /* @__PURE__ */ h(Oo, {
					s,
					onBrain: i,
					onDetail: a,
					repo: t,
					reqKey: n,
					board: e
				})
			}, s.id))
		})]
	}) : null : !o.text || c === "claimed" || c === "merged" || c === "closed" ? null : /* @__PURE__ */ g("p", {
		className: "br-next is-other",
		role: "status",
		"data-testid": "br-next",
		children: [
			/* @__PURE__ */ h("span", {
				className: "br-next-who",
				children: "此刻不用你做什么"
			}),
			/* @__PURE__ */ h("span", { children: o.text }),
			o.mr && /* @__PURE__ */ g(dt, {
				href: o.mr,
				className: "br-link",
				children: [Z.viewMr, " ↗"]
			})
		]
	});
}
function Eo({ s: e, open: t, repo: n, reqKey: r, onAnswered: i }) {
	let [a, o] = c(t), s = e.question;
	return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("div", {
		className: "br-next-row",
		children: [/* @__PURE__ */ g("div", {
			className: "br-next-text",
			children: [/* @__PURE__ */ g("p", { children: [/* @__PURE__ */ h("span", {
				className: "br-next-k",
				children: s.kind_label || "问题"
			}), /* @__PURE__ */ h("b", {
				className: "br-strong",
				children: s.question
			})] }), /* @__PURE__ */ g("p", {
				className: "br-next-hint",
				children: ["在这里就能回答：", s.answer_via === "mr" ? "回答会作为你在 MR 上的评论发出" : "回答会送进你的本机会话"]
			})]
		}), /* @__PURE__ */ h("div", {
			className: "br-next-acts",
			children: /* @__PURE__ */ h("button", {
				type: "button",
				className: `kt-btn${a ? "" : " is-primary"}`,
				"aria-expanded": a,
				onClick: () => o((e) => !e),
				children: a ? "收起" : "回答"
			})
		})]
	}), a && /* @__PURE__ */ h(Ir, {
		q: s,
		repo: n,
		reqKey: r,
		onAnswered: i
	})] });
}
function Do({ line: e, session: t }) {
	let n = f(), [r, i] = c(""), a = async () => {
		try {
			await navigator.clipboard.writeText(e), i("ok");
		} catch {
			i("fail");
		}
	};
	return /* @__PURE__ */ g("div", {
		className: "br-next-cmd",
		"data-testid": "type-line",
		title: mt,
		children: [
			/* @__PURE__ */ h("span", {
				className: "br-next-k",
				children: "在会话里打"
			}),
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => void a(),
				children: [/* @__PURE__ */ h($, {
					name: "Copy",
					size: 13
				}), Z.copyLine]
			}),
			t && /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => n(t),
				children: [/* @__PURE__ */ h($, {
					name: "MessageSquare",
					size: 13
				}), Z.openSession]
			}),
			r === "ok" && /* @__PURE__ */ h("span", {
				className: "br-small br-ok-text",
				role: "status",
				children: "已复制"
			}),
			r === "fail" && /* @__PURE__ */ h("span", {
				className: "br-small br-bad-text",
				role: "status",
				children: "没复制成：请手动选中这一行"
			}),
			/* @__PURE__ */ h("span", {
				className: "kt-dim br-small",
				children: "app 不会替你发"
			})
		]
	});
}
function Oo({ s: e, onBrain: t, onDetail: n, repo: r, reqKey: i, board: a }) {
	let o = f(), s = e.session && !e.line ? e.session : null, c = a.actors.find((e) => e.key === "local")?.session?.slot ?? null;
	return /* @__PURE__ */ g("div", {
		className: "br-next-row",
		children: [/* @__PURE__ */ g("div", {
			className: "br-next-text",
			children: [
				e.why ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("p", { children: [/* @__PURE__ */ h("span", {
					className: "br-next-k",
					children: "为什么被拒"
				}), /* @__PURE__ */ h("b", {
					className: "br-strong",
					children: e.why
				})] }), /* @__PURE__ */ g("p", {
					className: "br-pre-line",
					children: [/* @__PURE__ */ h("span", {
						className: "br-next-k",
						children: "怎么办"
					}), e.text]
				})] }) : /* @__PURE__ */ h("p", {
					className: "br-strong br-pre-line",
					children: e.text
				}),
				e.hint && /* @__PURE__ */ h("p", {
					className: "br-next-hint",
					children: e.hint
				}),
				e.command && /* @__PURE__ */ h(jo, { cmd: e.command }),
				e.line && /* @__PURE__ */ h(Do, {
					line: e.line,
					session: e.session ?? null
				}),
				e.say && /* @__PURE__ */ h(Br, { say: e.say }),
				e.raw && /* @__PURE__ */ g("details", {
					className: "br-raw",
					children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw })]
				})
			]
		}), /* @__PURE__ */ g("div", {
			className: "br-next-acts",
			children: [
				e.review && /* @__PURE__ */ h(Vr, {
					repo: r,
					reqKey: i,
					liveSlot: c,
					worktree: a.row.worktree
				}),
				s && !e.review && /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: () => o(s),
					children: ko[e.do] ?? Z.openSession
				}),
				!e.session && !e.line && (e.do === "reply" || e.do === "tool") && n && /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: n,
					title: "需求详情里能开一个新会话",
					children: "去需求详情开会话"
				}),
				e.mr && /* @__PURE__ */ g(dt, {
					href: e.mr,
					className: `kt-btn br-extbtn${Ao[e.do] ? " is-primary" : ""}`,
					children: [Ao[e.do] ?? Z.viewMr, " ↗"]
				}),
				e.do === "write_back" && t && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: t,
					children: [X.write_back, " ↗"]
				})
			]
		})]
	});
}
var ko = {
	reply: X.reply,
	tool: X.tool
}, Ao = {
	answer: Z.answerOnMr,
	accept: Z.acceptOnMr,
	label_handoff: X.label_handoff
};
function jo({ cmd: e }) {
	let [t, n] = c(!1), r = e.cwd ? `cd ${JSON.stringify(e.cwd)} && ${e.text}` : e.text, i = async () => {
		try {
			await navigator.clipboard.writeText(r), n(!0);
		} catch {
			n(!1);
		}
	};
	return /* @__PURE__ */ g("div", {
		className: "br-next-cmd",
		children: [
			/* @__PURE__ */ h("span", {
				className: "br-next-k",
				children: "在哪做"
			}),
			/* @__PURE__ */ h("span", { children: e.cwd ? "在这个需求的工作目录里开一个终端，敲：" : "在本机这个需求的分支上开一个终端，敲：" }),
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				title: r,
				children: e.text
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => void i(),
				children: [/* @__PURE__ */ h($, {
					name: "Copy",
					size: 13
				}), "复制命令"]
			}),
			t && /* @__PURE__ */ h("span", {
				className: "br-small br-ok-text",
				role: "status",
				children: "已复制（含 cd 到工作目录）"
			}),
			e.cwd && /* @__PURE__ */ h("span", {
				className: "kt-dim kt-mono br-next-cwd",
				title: e.cwd,
				children: e.cwd
			})
		]
	});
}
//#endregion
//#region src/board/Header.tsx
function Mo({ board: e, replaying: t, follow: n, onReplay: r, onFollow: i, onDetail: a, onSession: o, onStart: s, onParent: c, onFamily: l }) {
	let u = e.row, d = e.actors.find((e) => e.key === "local")?.session ?? null, f = e.actors.find((e) => e.key === "runner")?.session ?? null, p = e.ended_at !== null || u.state === "merged" || u.state === "closed";
	return /* @__PURE__ */ g("header", {
		className: "kt-top",
		children: [/* @__PURE__ */ g("div", {
			className: "kt-title",
			children: [
				lr(u) ? a ? /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-run-title kt-run-link",
					onClick: a,
					title: "需求详情：周期、时间花在哪、成本、检查、决定和问题",
					children: u.title
				}) : /* @__PURE__ */ h("span", {
					className: "kt-run-title",
					children: u.title
				}) : null,
				/* @__PURE__ */ h("span", {
					className: "kt-pill tone-info kt-mono",
					"data-testid": "br-board-key",
					children: u.key
				}),
				/* @__PURE__ */ h(et, {
					state: u.state,
					label: u.state_label,
					who: u.waits.who
				}),
				u.family && /* @__PURE__ */ h(No, {
					f: u.family,
					onParent: c,
					onFamily: l
				}),
				e.live && !t && /* @__PURE__ */ g("span", {
					className: "kt-pill tone-run is-live",
					children: [/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: "●"
					}), "此刻有人在做"]
				}),
				or(e) && /* @__PURE__ */ h("span", {
					className: "kt-pill tone-idle",
					"data-testid": "br-local-only",
					title: "这个仓库没有远端：不交给运行机，没有 MR，在本机做完、在本机合并",
					children: "这个仓库只在本机做"
				}),
				/* @__PURE__ */ g("span", {
					className: "kt-run-meta kt-mono",
					title: u.worktree ?? void 0,
					children: [e.branch ? `${e.branch} ← ${e.base}` : cr(e) ? "运行分支还读不到：运行机还没建工作区" : `还没有运行分支（${e.base}）`, u.owner ? ` · ${u.owner}` : ""]
				})
			]
		}), /* @__PURE__ */ g("div", {
			className: "kt-actions",
			children: [
				r && !t && e.events.length > 1 && /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: r,
					title: p ? "按记录从头重放：谁在什么时候做了什么，哪里等人、哪里被退回" : "把到现在为止的经过重放一遍",
					children: "▶ 回放"
				}),
				!t && d && o && /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => o(d.url),
					title: "在 Kiro Crew 里打开本机的 brain-dev 会话",
					children: Z.openSession
				}),
				!t && f && o && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn",
					onClick: () => o(f.url),
					title: "打开运行机上的 brain-run 会话",
					children: [Z.openSession, "（运行机）"]
				}),
				!t && s && u.state === "claimed" && /* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: s,
					children: [
						X.start,
						" ",
						u.key
					]
				}),
				/* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					"aria-pressed": n,
					onClick: i,
					title: "自动滚到正在动的那一环",
					children: "跟随"
				}),
				a && /* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn",
					onClick: a,
					children: "需求详情 ↗"
				})
			]
		})]
	});
}
function No({ f: e, onParent: t, onFamily: n }) {
	if (e.role === "child") return /* @__PURE__ */ g(m, { children: [t ? /* @__PURE__ */ g("button", {
		type: "button",
		className: "kt-pill kt-pill-btn tone-handoff br-fam-parent",
		onClick: () => t(e.parent),
		title: `大需求 ${e.parent}${e.parent_title ? `：${e.parent_title}` : ""}（它的需求看板）`,
		children: [
			/* @__PURE__ */ h("i", {
				"aria-hidden": "true",
				children: "↑"
			}),
			"大需求 ",
			e.parent
		]
	}) : /* @__PURE__ */ g("span", {
		className: "kt-pill tone-handoff",
		children: [
			/* @__PURE__ */ h("i", {
				"aria-hidden": "true",
				children: "↑"
			}),
			"大需求 ",
			e.parent
		]
	}), e.unit && /* @__PURE__ */ g("span", {
		className: "kt-pill tone-info",
		"data-testid": "br-board-unit",
		children: ["单元 ", e.unit]
	})] });
	let r = e.role === "big" ? "大需求 · 还没拆" : `大需求 · 已合并 ${e.progress ? `${e.progress.merged}/${e.progress.total}` : `${e.children.filter((e) => e.state === "merged").length}/${e.children.filter((e) => e.state !== "closed").length}`}`;
	return n ? /* @__PURE__ */ h("button", {
		type: "button",
		className: "kt-pill kt-pill-btn tone-handoff br-fam-parent",
		onClick: n,
		title: "看它的小需求",
		children: r
	}) : /* @__PURE__ */ h("span", {
		className: "kt-pill tone-handoff",
		children: r
	});
}
function Po({ board: e, reducedMotion: t, onActor: n, replaying: r = !1 }) {
	return /* @__PURE__ */ g("div", {
		className: "kt-kpis br-kpis",
		role: "group",
		"aria-label": "指标",
		children: [
			/* @__PURE__ */ h(Io, {
				board: e,
				reducedMotion: t
			}),
			/* @__PURE__ */ h(Lo, { board: e }),
			/* @__PURE__ */ h(zo, { board: e }),
			/* @__PURE__ */ h(Bo, {
				board: e,
				onActor: n,
				replaying: r
			}),
			/* @__PURE__ */ h(Vo, {
				board: e,
				reducedMotion: t,
				replaying: r
			})
		]
	});
}
var Fo = {
	pass: "is-pass",
	fail: "is-fail",
	wait: "is-wait",
	watch: "is-watch"
};
function Io({ board: e, reducedMotion: t }) {
	let n = e.checks, r = Math.round(xi(n.passed, 900, t)), i = Si(n.passed), a = hr(n, e);
	return /* @__PURE__ */ g("div", {
		className: `kt-kpi kt-kpi-tests${a.green ? " is-green" : ""}`,
		children: [
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-label",
				children: "检查通过"
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-value",
				"data-testid": "br-checks-counter",
				"aria-label": `检查通过 ${n.passed}/${n.total}`,
				children: [/* @__PURE__ */ h("span", {
					className: `kt-kpi-big${i ? " is-pop" : ""}`,
					children: r
				}, i), /* @__PURE__ */ g("span", {
					className: "kt-kpi-of",
					children: ["/", n.total]
				})]
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-segs",
				"aria-hidden": "true",
				children: n.cells.filter((e) => Fo[e.status]).map((e) => /* @__PURE__ */ h("i", {
					className: Fo[e.status],
					title: e.name
				}, e.id))
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-note",
				"data-testid": "br-checks-say",
				children: /* @__PURE__ */ h("b", {
					className: `tone-${a.tone}`,
					children: a.text
				})
			})
		]
	});
}
function Lo({ board: e }) {
	let t = dr(e.row.lean), n = t.done_n + t.skipped_n, r = e.events.filter((e) => e.kind === "approve").length, i = e.events.filter((e) => e.kind === "reject").length, a = e.events.filter((e) => e.kind === "blocked").length, o = cr(e), s = (e) => e < t.done_n ? "is-pass" : e < n ? "is-skip" : !o && t.next && e === t.next.n - 1 ? t.started ? "is-run" : "is-next" : "";
	return /* @__PURE__ */ g("div", {
		className: "kt-kpi kt-kpi-gates br-kpi-lean",
		"aria-label": `AI-DLC Lean：${o ? "运行机还读不到 Lean 的记录" : Re(t)}`,
		children: [
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-label",
				children: "AI-DLC Lean"
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-value",
				"data-testid": "br-lean-counter",
				children: [/* @__PURE__ */ h("span", {
					className: "kt-kpi-big",
					children: t.done_n
				}), /* @__PURE__ */ g("span", {
					className: "kt-kpi-of",
					children: ["做完", t.skipped_n ? ` · 跳过 ${t.skipped_n}` : ""]
				})]
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-segs",
				"aria-hidden": "true",
				children: Array.from({ length: t.total }, (e, t) => /* @__PURE__ */ h("i", { className: s(t) }, t))
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-note br-lean-next",
				children: o ? "运行机还读不到 Lean 的记录" : t.next ? /* @__PURE__ */ g(m, { children: [
					t.started ? "在做" : "下一步",
					"：",
					/* @__PURE__ */ h("b", { children: t.next.label })
				] }) : n ? "全部做完" : "还没开始"
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-gates-rows",
				children: [
					/* @__PURE__ */ g("span", { children: ["批准 ", /* @__PURE__ */ h("b", { children: r })] }),
					/* @__PURE__ */ g("span", {
						className: i ? "is-hit" : "",
						children: ["退回 ", /* @__PURE__ */ h("b", { children: i })]
					}),
					/* @__PURE__ */ g("span", {
						className: a ? "is-hit" : "",
						children: ["拦下 ", /* @__PURE__ */ h("b", { children: a })]
					})
				]
			})
		]
	});
}
function Ro(e) {
	let t = e.events.filter((e) => (e.kind === "approve" || e.kind === "reject") && e.from === "person").length, n = e.events.filter((e) => e.kind === "answer" && e.from === "person").length, r = e.decisions.filter((e) => e.by === "person").length, i = e.events.filter((e) => e.kind === "commit" && e.from === "person").length;
	return {
		gates: t,
		answers: Math.max(n, r),
		outside: i
	};
}
function zo({ board: e }) {
	let { gates: t, answers: n, outside: r } = Ro(e), i = t + n;
	return /* @__PURE__ */ g("div", {
		className: `kt-kpi br-kpi-people${r ? " is-warn" : ""}`,
		children: [
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-label",
				children: "人介入"
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-value",
				children: [/* @__PURE__ */ h("span", {
					className: "kt-kpi-big",
					children: i + r
				}), /* @__PURE__ */ h("span", {
					className: "kt-kpi-of",
					children: "次"
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-dots",
				"aria-hidden": "true",
				children: [Array.from({ length: i }, (e, t) => /* @__PURE__ */ h("i", { className: "is-point" }, `a${t}`)), Array.from({ length: r }, (e, t) => /* @__PURE__ */ h("i", { className: "is-out" }, `o${t}`))]
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-note",
				children: [
					/* @__PURE__ */ g("b", {
						className: "tone-ok",
						children: ["判断点上 ", i]
					}),
					i ? `（审批 ${t} · 回答 ${n}）` : "",
					r ? /* @__PURE__ */ g(m, { children: [" · ", /* @__PURE__ */ g("b", {
						className: "tone-warn",
						children: ["判断点之外 ", r]
					})] }) : " · 判断点之外 0"
				]
			})
		]
	});
}
function Bo({ board: e, onActor: t, replaying: n }) {
	let r = e.actors.filter((e) => e.status !== "skipped"), i = r.filter((e) => e.status === "merged" || e.status === "done").length, a = r.filter((e) => Pn.has(e.status)).length, o = ar(e), s = ja(e, n);
	return /* @__PURE__ */ g("div", {
		className: "kt-kpi kt-kpi-roles",
		children: [
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-label",
				children: "这条路走到哪了"
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-value",
				"data-testid": "br-steps-counter",
				children: [/* @__PURE__ */ h("span", {
					className: "kt-kpi-big",
					children: i
				}), /* @__PURE__ */ g("span", {
					className: "kt-kpi-of",
					children: ["/", r.length]
				})]
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-role-dots",
				children: r.map((n) => {
					let r = Mn(n.status), i = $n(n.status, e), a = n.status === "awaiting_approval" && !o ? "info" : r.tone;
					return /* @__PURE__ */ h("button", {
						type: "button",
						className: `kt-role-dot tone-${a}${Pn.has(n.status) ? " is-working" : ""}`,
						title: `${n.title}：${i}（点一下只看它）`,
						"aria-label": `${n.title}：${i}`,
						onClick: () => t?.(n.key),
						children: /* @__PURE__ */ h(Y, {
							role: n.icon,
							size: 15
						})
					}, n.key);
				})
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-kpi-note",
				children: [a ? /* @__PURE__ */ g("b", {
					className: "tone-run",
					children: ["在做 ", a]
				}) : "没有在做的", s ? /* @__PURE__ */ g("b", {
					className: o ? "tone-approve" : "tone-info",
					children: [
						" · ",
						s,
						" 个",
						Qn(e)
					]
				}) : null]
			})
		]
	});
}
function Vo({ board: e, reducedMotion: t, replaying: n }) {
	let r = n ? null : e.credits.total, i = xi(r ?? 0, 900, t), a = e.sessions.length;
	return /* @__PURE__ */ g("div", {
		className: "kt-kpi kt-kpi-credits",
		children: [
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-label",
				children: "credits"
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-value",
				children: /* @__PURE__ */ h("span", {
					className: "kt-kpi-big",
					children: r === null ? "—" : Hn(i)
				})
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-kpi-note",
				children: n ? "回放时不算" : r === null ? a ? "这个 app 开的会话还没报" : "还没开过会话" : a ? `${a} 个会话合计` : "运行记录里的合计"
			})
		]
	});
}
var Ho = (e) => ({
	phase: "0 认领",
	title: "一个需求号，文档过五关",
	steps: [[{
		icon: "person",
		title: e,
		does: "认领、交文档、开工"
	}]]
}), Uo = [
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
			does: "会话里打一行"
		}, {
			icon: "design",
			title: "设计审批",
			does: "会话里打一行"
		}]]
	},
	{
		phase: "2 交给运行机",
		title: "桥核对，签名服务签合同",
		steps: [
			[{
				icon: "handover",
				title: "交接",
				does: "把分支交出去"
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
				does: "无人值守"
			}]
		]
	},
	{
		phase: "3 检查 · 验收",
		title: "机器检查，产品验收",
		steps: [[{
			icon: "ci",
			title: "CI 检查",
			does: "跑自动检查"
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
			does: "学到的写回去"
		}]]
	}
], Wo = [
	Uo[0],
	{
		phase: "2 检查 · 发布",
		title: "机器检查，你批准发布",
		steps: [[{
			icon: "ci",
			title: "CI 检查",
			does: "跑自动检查"
		}, {
			icon: "release",
			title: "发布审批",
			does: "会话里打一行"
		}]]
	},
	{
		phase: "3 回写",
		title: "学到的写回 Brain",
		steps: [[{
			icon: "brain",
			title: "回写 Brain",
			does: "学到的写回去"
		}]]
	}
], Go = [
	{
		phase: "0 认领",
		title: "谁做哪个单元",
		steps: [[{
			icon: "person",
			title: Q.claim,
			does: "先推上去的算"
		}]]
	},
	{
		phase: "1 开工",
		title: "从大需求的分支开",
		steps: [[{
			icon: "laptop",
			title: "本机会话",
			does: "自己的工作目录、自己的 Lean 团队"
		}]]
	},
	{
		phase: "2 做 · 同步",
		title: "Lean 推进，合并前同步",
		steps: [[{
			icon: "ci",
			title: "CI 检查",
			does: "跑自动检查"
		}], [{
			icon: "merge",
			title: Q.sync,
			does: "把大需求的分支合进来"
		}]]
	},
	{
		phase: "3 交接",
		title: "MR 交给大需求的负责人",
		steps: [[{
			icon: "handover",
			title: "交接",
			does: "开 MR 到大需求的分支"
		}]]
	},
	{
		phase: "4 合并",
		title: "合进大需求",
		steps: [[{
			icon: "release",
			title: "合并",
			does: "大需求的负责人评审、合并"
		}]]
	}
];
function Ko({ board: e, onStart: t }) {
	let n = e.row.family, r = n?.role === "child" ? n : null, i = !r && or(e), a = r ? r.owner : e.person.owner, o = r ? Go : [Ho(t ? "你" : a ?? "负责人"), ...i ? Wo : Uo], s = t ? "你" : a ? ` ${a} ` : "负责人", c = r ? r.state === "unclaimed" || !r.owner ? `${e.row.key} 待认领` : `${e.row.key} ${r.owner} 认领了，还没开工` : `${e.row.key} 认领了，还没开工`;
	return /* @__PURE__ */ g("section", {
		className: "kt-empty",
		"data-testid": "br-board-intro",
		"aria-label": "这个需求还没开工",
		children: [
			/* @__PURE__ */ g("div", {
				className: "kt-empty-hero",
				children: [
					/* @__PURE__ */ h("h2", { children: c }),
					r ? /* @__PURE__ */ g("p", { children: [
						r.parent,
						" 的小需求",
						r.unit ? `，单元 ${r.unit}` : "",
						"。认领以后开工：从大需求的分支 ",
						r.branch ?? "",
						" 开一个分支，放在它自己的工作目录里，brain-dev 会话带着 Lean 推进；合并之前同步一次，把大需求的分支合进来；做完交接，MR 交给大需求的负责人合并（小需求不交给运行机）。"
					] }) : i ? /* @__PURE__ */ g("p", { children: [
						"开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求、设计和发布都由",
						s,
						"在会话里自己批准；检查过了就在本机合并；合并以后，学到的东西写回 Brain。"
					] }) : /* @__PURE__ */ g("p", { children: [
						"开工以后，这里一屏看完它怎么走：本机的 brain-dev 会话带着 AI-DLC Lean 推进，需求和设计由",
						s,
						"在会话里自己批准；交给运行机以后，桥核对交接，签名服务签合同，运行机无人值守地做，有问题停下来在 MR 上问人；检查过了，产品在 MR 上验收；合并以后，学到的东西写回 Brain。"
					] }),
					/* @__PURE__ */ h("p", {
						className: "kt-empty-punch",
						children: r ? "各做各的单元，做完合回大需求。" : i ? "人只在判断点上出手：批准需求、设计和发布，回答问题。" : "人只在判断点上出手：批准、回答、验收。"
					})
				]
			}),
			/* @__PURE__ */ h("ol", {
				className: `kt-team-intro is-phased br-way${i ? " is-local" : ""}`,
				"aria-label": r ? "一个小需求的路，从左到右" : "一个需求的路，从左到右",
				children: o.map((e) => /* @__PURE__ */ g("li", {
					className: "kt-intro-phase",
					children: [/* @__PURE__ */ g("div", {
						className: "kt-intro-phase-head",
						children: [/* @__PURE__ */ h("b", { children: e.phase }), /* @__PURE__ */ h("span", { children: e.title })]
					}), /* @__PURE__ */ h("div", {
						className: "kt-intro-phase-body",
						children: e.steps.map((e, t) => /* @__PURE__ */ h("div", {
							className: "kt-intro-stage",
							children: e.map((e) => /* @__PURE__ */ g("div", {
								className: "kt-intro-role",
								children: [
									/* @__PURE__ */ h(Y, {
										role: e.icon,
										size: 26,
										className: "kt-intro-emoji"
									}),
									/* @__PURE__ */ h("span", {
										className: "kt-intro-name",
										children: /* @__PURE__ */ h("b", { children: e.title })
									}),
									/* @__PURE__ */ h("span", {
										className: "kt-intro-does",
										children: e.does.split(/(?<=、)/).map((e) => /* @__PURE__ */ h("span", {
											className: "br-phrase",
											children: e
										}, e))
									})
								]
							}, e.title))
						}, t))
					})]
				}, e.phase))
			}),
			/* @__PURE__ */ h("div", {
				className: "br-hero-acts",
				"data-testid": "br-intro-start",
				children: r ? /* @__PURE__ */ g("span", {
					className: "kt-dim",
					children: [
						r.owner ? `${r.owner} 认领的 · ` : "",
						Q.claim,
						"、",
						Z.start,
						"、",
						Q.sync,
						"都在上面「",
						r.parent,
						" 的小需求」卡片上"
					]
				}) : t ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: "kt-btn is-primary br-btn-big",
					onClick: t,
					children: [
						X.start,
						" ",
						e.row.key
					]
				}), /* @__PURE__ */ g("span", {
					className: "kt-dim",
					children: [
						"在开需求里接着填：需求号 ",
						e.row.key,
						" 和标题已经带过去了 · 认领于 ",
						Wn(e.started_at)
					]
				})] }) : a ? /* @__PURE__ */ g("span", {
					className: "br-strong",
					children: [
						a,
						" 认领的，等 ",
						a,
						" 开工",
						/* @__PURE__ */ g("span", {
							className: "kt-dim",
							children: [" · 认领于 ", Wn(e.started_at)]
						})
					]
				}) : /* @__PURE__ */ g("span", {
					className: "kt-dim",
					children: ["认领于 ", Wn(e.started_at)]
				})
			})
		]
	});
}
//#endregion
//#region src/board/Lanes.tsx
function qo({ board: e, focus: t, bumps: n, onActor: r, quiet: i = !1 }) {
	let a = e.actors.filter((e) => e.status === "skipped"), o = $o(e, bi());
	return /* @__PURE__ */ g("section", {
		className: "kt-lanes",
		"aria-label": "各环节的泳道",
		"data-testid": "kt-lanes",
		children: [
			/* @__PURE__ */ h(es, {
				board: e,
				ax: o
			}),
			e.actors.filter((e) => e.status !== "skipped").map((a) => /* @__PURE__ */ h(rs, {
				a,
				board: e,
				ax: o,
				focused: t === a.key,
				dim: !!t && t !== a.key,
				bump: n[a.key] ?? 0,
				onActor: r,
				quiet: i
			}, a.key)),
			a.length > 0 && /* @__PURE__ */ g("p", {
				className: "kt-dim kt-lanes-out",
				"data-testid": "kt-lanes-out",
				children: ["这次不需要：", Jo(a)]
			})
		]
	});
}
function Jo(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = n.doing.replace(/^这次不需要[：:]?\s*/, "");
		t.set(e, [...t.get(e) ?? [], n.title]);
	}
	return [...t].map(([e, t]) => `${t.join("、")}${e ? `（${e}）` : ""}`).join("；");
}
function Yo(e) {
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
function Xo(e) {
	if (e <= 0) return "0";
	if (e < 3600) return `${Math.round(e / 60)} 分`;
	if (e < 86400) {
		let t = Math.round(e / 60);
		return t % 60 ? `${Math.floor(t / 60)} 小时 ${t % 60} 分` : `${t / 60} 小时`;
	}
	let t = Math.floor(e / 86400), n = Math.round(e % 86400 / 3600);
	return n ? `${t} 天 ${n} 时` : `${t} 天`;
}
function Zo(e) {
	let t = [...e.events.map((e) => e.at), ...e.belt.map((e) => e.at)];
	for (let n of e.actors) {
		for (let e of n.marks) t.push(e.at);
		for (let e of n.spans) t.push(e.b ?? e.a);
	}
	return t.length ? Math.max(...t) : null;
}
function Qo(e) {
	let t = e.events.find((e) => e.kind === "start");
	if (t) return {
		t0: t.at,
		from: "开工"
	};
	let n = e.started_at ?? e.events[0]?.at ?? e.at;
	return {
		t0: n,
		from: e.events.some((e) => e.kind === "claim" && e.at === n) ? "认领" : ""
	};
}
function $o(e, t) {
	let { t0: n, from: r } = Qo(e), i = Math.max(n + 60, e.ended_at ?? t), a = Math.min(i, Math.max(n + 60, Zo(e) ?? i)), o = i - a, s = e.ended_at === null && o > Math.max(900, .3 * (a - n)) ? o : null, c = s === null ? 100 : 84, l = s === null ? i : a;
	return {
		t0: n,
		from: r,
		last: a,
		end: i,
		tail: s,
		pct: (e) => e <= l ? Math.max(0, (e - n) / (l - n) * c) : Math.min(100, c + (e - a) / (i - a) * 16)
	};
}
function es({ board: e, ax: t }) {
	let n = Yo((t.tail === null ? t.end : t.last) - t.t0), r = e.actors.some((e) => e.status === "awaiting_approval");
	return /* @__PURE__ */ g("div", {
		className: "kt-lane kt-lane-axis",
		"aria-hidden": "true",
		children: [/* @__PURE__ */ g("div", {
			className: "kt-axis-title",
			"data-testid": "kt-axis-title",
			children: [
				"时间线（从 ",
				Wn(t.t0),
				" ",
				t.from,
				"起）"
			]
		}), /* @__PURE__ */ g("div", {
			className: "kt-axis",
			children: [n.map((e, n) => {
				let r = t.pct(t.t0 + e), i = n === 0 ? " is-first" : r > (t.tail === null ? 92 : 78) ? " is-last" : "";
				return /* @__PURE__ */ h("span", {
					className: `kt-axis-tick${i}`,
					style: { left: `${r}%` },
					children: Xo(e)
				}, e);
			}), t.tail !== null && /* @__PURE__ */ g("span", {
				className: "kt-axis-tail",
				style: {
					left: "84%",
					width: "16%"
				},
				"data-testid": "kt-axis-tail",
				title: `最后一次动静以后又过了 ${Bn(t.tail)}${r ? "，一直在等" : e.live ? "" : "，没有动静"}：这一段画短了`,
				children: ["之后 ", Bn(t.tail)]
			})]
		})]
	});
}
var ts = {
	commit: "提交",
	approved: "批准",
	rejected: "退回",
	request: "请求批准",
	refused: "批准的那一行没被接受",
	blocked: "Lean 拦下",
	handover: "交接",
	accepted: "桥接手",
	signed: "签名",
	question: "问人",
	answer: "回答",
	"verify-ok": "自动检查通过",
	"verify-fail": "自动检查没过",
	reflect: "回写",
	session: "会话"
};
function ns({ a: e, board: t, ax: n }) {
	let r = bi(), i = (n) => n.kind === "wait" ? Qn(t, tr(e, t, n)) : n.kind === "fix" ? "返工" : "在做", a = (t) => t === "wait" ? e.status === "awaiting_approval" : Pn.has(e.status);
	return /* @__PURE__ */ g("div", {
		className: "kt-track",
		role: "img",
		"aria-label": `${e.title}的时间线：${e.spans.length ? e.spans.map((e) => `${i(e)} ${Bn((e.b ?? r) - e.a)}`).join("，") : "还没开始"}`,
		children: [
			/* @__PURE__ */ h("div", { className: "kt-track-line" }),
			n.tail !== null && /* @__PURE__ */ h("div", {
				className: "kt-track-tail",
				style: {
					left: "84%",
					width: "16%"
				}
			}),
			e.spans.map((o, s) => /* @__PURE__ */ h("span", {
				className: `kt-track-span is-${o.kind}${o.b === null && a(o.kind) ? " is-live" : ""}${o.kind === "wait" && tr(e, t, o) !== "you" ? " is-other" : ""}`,
				style: {
					left: `${n.pct(o.a)}%`,
					width: `${Math.max(.6, n.pct(o.b ?? r) - n.pct(o.a))}%`
				},
				title: `${i(o)}：${Wn(o.a)} 起，${o.b === null ? `到现在（${Bn(r - o.a)}）` : `用了 ${Bn(o.b - o.a)}`}${n.from ? `（${n.from}后 ${Bn(o.a - n.t0)}）` : ""}`
			}, s)),
			e.marks.map((e, t) => /* @__PURE__ */ h("span", {
				className: `kt-track-mark is-${e.kind}`,
				style: { left: `${n.pct(e.at)}%` },
				title: `${Wn(e.at)} · ${e.title}`
			}, `m${t}`))
		]
	});
}
function rs({ a: e, board: t, ax: n, focused: r, dim: i, bump: a, onActor: o, quiet: s }) {
	let c = Mn(e.status), l = e.status === "waiting", u = e.status === "awaiting_approval" && !ar(t);
	return /* @__PURE__ */ g("article", {
		className: `kt-lane is-${e.status} tone-${u ? "info" : c.tone}${r ? " is-focus" : ""}${i ? " is-dim" : ""}${l ? " is-compact" : ""}`,
		"data-testid": "kt-lane",
		"data-role": e.key,
		"data-status": e.status,
		"aria-label": `${e.title}：${$n(e.status, t)}`,
		children: [
			a > 0 && /* @__PURE__ */ h("span", {
				className: "kt-lane-bump",
				"aria-hidden": "true"
			}, a),
			/* @__PURE__ */ h(is, {
				a: e,
				board: t,
				focused: r,
				onActor: o,
				quiet: s
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-lane-live",
				children: /* @__PURE__ */ h(ss, {
					a: e,
					board: t,
					quiet: s
				})
			}),
			/* @__PURE__ */ h("div", {
				className: "kt-lane-work",
				children: !l && /* @__PURE__ */ h(ls, {
					a: e,
					board: t
				})
			}),
			/* @__PURE__ */ h(ns, {
				a: e,
				board: t,
				ax: n
			})
		]
	});
}
function is({ a: e, board: t, focused: n, onActor: r, quiet: i }) {
	let a = Mn(e.status), o = f(), s = e.status === "awaiting_approval", c = ar(t), l = $n(e.status, t);
	return /* @__PURE__ */ g("div", {
		className: "kt-lane-id",
		children: [
			/* @__PURE__ */ h("button", {
				type: "button",
				className: "kt-avatar",
				onClick: () => r(e.key),
				"aria-pressed": n,
				"aria-label": n ? `不再只看${e.title}` : `只看${e.title}`,
				title: n ? "再点一次看全部" : "只看这一环",
				children: /* @__PURE__ */ h(Y, {
					role: e.icon,
					size: 22
				})
			}),
			/* @__PURE__ */ g("div", {
				className: "kt-lane-who",
				children: [
					/* @__PURE__ */ h("div", {
						className: "kt-lane-name",
						children: /* @__PURE__ */ h("span", { children: e.title })
					}),
					/* @__PURE__ */ h("div", {
						className: "kt-lane-doing",
						children: e.sub
					}),
					/* @__PURE__ */ h("div", {
						className: "kt-lane-tag",
						children: /* @__PURE__ */ g("span", {
							className: `kt-pill tone-${s && !c ? "info" : a.tone}${e.status === "running" || s && c ? " is-live" : ""}`,
							title: a.hint,
							children: [/* @__PURE__ */ h("i", {
								"aria-hidden": "true",
								children: a.icon
							}), l]
						})
					})
				]
			}),
			e.status !== "waiting" && /* @__PURE__ */ g("p", {
				className: "kt-lane-stats",
				children: [e.since !== null && (s ? /* @__PURE__ */ g("span", {
					title: `从 ${Wn(e.since)} 起`,
					children: ["⏱ 等了 ", /* @__PURE__ */ h("b", { children: /* @__PURE__ */ h(os, { since: e.since }) })]
				}) : /* @__PURE__ */ g("span", {
					title: Wn(e.since),
					children: ["⏱ ", /* @__PURE__ */ h("b", { children: /* @__PURE__ */ h(as, { at: e.since }) })]
				})), e.credits !== null && /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("b", { children: Hn(e.credits) }), " credits"] })]
			}),
			!i && e.session && /* @__PURE__ */ g("button", {
				type: "button",
				className: "kt-out-btn",
				onClick: () => o(e.session.url),
				title: "在 Kiro Crew 里打开它的会话",
				children: [Z.openSession, " ›"]
			})
		]
	});
}
function as({ at: e }) {
	let t = bi();
	return /* @__PURE__ */ h(m, { children: Vn(t - e) });
}
function os({ since: e }) {
	let t = bi();
	return /* @__PURE__ */ h(m, { children: Bn(t - e) });
}
function ss({ a: e, board: t, quiet: n }) {
	let r = Mn(e.status), i = ar(t), a = e.status === "awaiting_approval" && !i, o = {
		awaiting_approval: e.status === "awaiting_approval" && e.doing.startsWith("等") ? i ? "✋" : "" : `${i ? "✋ " : ""}${$n(e.status, t)}：`,
		failed: "✕ 没过：",
		stalled: "⚠ 卡住：",
		fixing: "↻ 返工：",
		queued: "⏸ 排队：",
		merged: "✔ 完成",
		done: "✓ 做完这步",
		running: "●",
		waiting: "还没轮到："
	}[e.status] ?? r.label, s = o.replace(/[：:]$/, ""), c = !e.doing || e.doing === r.label || e.doing === s;
	return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("div", {
		className: `kt-situation tone-${a ? "info" : r.tone}`,
		children: [/* @__PURE__ */ h("strong", { children: c ? e.status === "running" ? "● 在做" : s : o }), !c && /* @__PURE__ */ h("span", {
			className: "kt-summary",
			children: e.doing
		})]
	}), !n && i && e.line && /* @__PURE__ */ h(ht, {
		line: e.line,
		sessionUrl: e.session?.url ?? null
	})] });
}
function cs(e, t) {
	if (e.key !== "local") return e.facts;
	let n = e.facts.filter((e) => !e.startsWith("Lean 做完"));
	return t.row.lean.stage ? [`Lean ${Re(dr(t.row.lean))}`, ...n] : n;
}
function ls({ a: e, board: t }) {
	let n = t.belt.filter((t) => t.actor === e.key && t.kind !== "merge"), r = e.key === "ci" ? t.checks.cells.filter((e) => e.group === "verify" && (e.status === "pass" || e.status === "fail")) : [], i = e.marks.filter((e) => !n.length || e.kind !== "commit" && e.kind !== "handover").slice().reverse().slice(0, n.length ? 2 : 4), a = cs(e, t);
	return !a.length && !i.length && !n.length && !r.length ? /* @__PURE__ */ h("p", {
		className: "kt-dim kt-nothing",
		children: "还没有记录"
	}) : /* @__PURE__ */ g(m, { children: [
		a.length > 0 && /* @__PURE__ */ h("ul", {
			className: "kt-tools br-facts-chips",
			"aria-label": "事实",
			children: a.map((e) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h("span", {
				className: "kt-mono br-fact",
				title: /次运行$/.test(e) && t.row.run_ids.length ? `运行号 ${t.row.run_ids.join("、")}` : void 0,
				children: e
			}) }, e))
		}),
		n.length > 0 && /* @__PURE__ */ h(ds, { commits: n }),
		r.length > 0 && /* @__PURE__ */ g("div", {
			className: "kt-owned",
			"aria-label": "自动检查的结果",
			children: [/* @__PURE__ */ h("span", {
				className: "kt-dim",
				children: "自动检查"
			}), r.map((e) => /* @__PURE__ */ g("span", {
				className: `kt-owned-case is-${e.status}`,
				title: e.detail,
				children: [
					e.label,
					" ",
					e.status === "pass" ? "✓" : "✕"
				]
			}, e.id))]
		}),
		i.length > 0 && /* @__PURE__ */ h("ul", {
			className: "kt-commits",
			"aria-label": "最近的记录",
			children: i.map((e, t) => /* @__PURE__ */ g("li", { children: [/* @__PURE__ */ h("code", {
				className: `br-mark is-${e.kind}`,
				children: ts[e.kind] ?? e.kind
			}), /* @__PURE__ */ g("span", {
				title: e.title,
				children: [
					Wn(e.at),
					" · ",
					e.title
				]
			})] }, t))
		})
	] });
}
function us(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) for (let e of n.changes ?? []) {
		let n = t.get(e.path);
		t.set(e.path, n ? {
			...n,
			added: n.added + e.added,
			removed: n.removed + e.removed,
			status: n.status === "A" ? "A" : e.status
		} : { ...e });
	}
	return [...t.values()].sort((e, t) => t.added + t.removed - (e.added + e.removed));
}
function ds({ commits: e }) {
	let t = us(e), n = t.reduce((e, t) => e + t.added, 0), r = t.reduce((e, t) => e + t.removed, 0), i = Math.max(1, ...t.map((e) => e.added + e.removed)), a = Math.max(1, ...e.map((e) => e.files)), o = t.slice(0, 5);
	return /* @__PURE__ */ g("div", {
		className: "br-changes",
		"data-testid": "kt-changes",
		children: [
			/* @__PURE__ */ g("div", {
				className: "kt-files-head",
				children: [/* @__PURE__ */ h("span", { children: "改动" }), t.length > 0 ? /* @__PURE__ */ g(m, { children: [
					/* @__PURE__ */ g("span", {
						className: "kt-add",
						children: ["+", n]
					}),
					/* @__PURE__ */ g("span", {
						className: "kt-del",
						children: ["−", r]
					}),
					/* @__PURE__ */ g("span", {
						className: "kt-dim",
						children: [
							t.length,
							" 个文件 · 提交 ",
							e.length,
							" 次"
						]
					})
				] }) : /* @__PURE__ */ g("span", {
					className: "kt-dim",
					children: [
						"提交 ",
						e.length,
						" 次"
					]
				})]
			}),
			o.length > 0 && /* @__PURE__ */ g("ul", {
				className: "kt-files",
				children: [o.map((e) => /* @__PURE__ */ g("li", {
					title: `${e.path}  +${e.added} −${e.removed}`,
					children: [
						/* @__PURE__ */ h("span", {
							className: `kt-file-st is-${e.status}`,
							children: e.status
						}),
						/* @__PURE__ */ g("span", {
							className: "kt-file-path kt-mono is-split",
							children: [/* @__PURE__ */ h("span", {
								className: "kt-file-dir",
								children: e.path.slice(0, e.path.lastIndexOf("/") + 1)
							}), /* @__PURE__ */ h("span", {
								className: "kt-file-base",
								children: e.path.slice(e.path.lastIndexOf("/") + 1)
							})]
						}),
						/* @__PURE__ */ g("span", {
							className: "kt-file-bar",
							"aria-hidden": "true",
							children: [/* @__PURE__ */ h("i", {
								className: "kt-bar-add",
								style: { width: `${e.added / i * 100}%` }
							}), /* @__PURE__ */ h("i", {
								className: "kt-bar-del",
								style: { width: `${e.removed / i * 100}%` }
							})]
						}),
						/* @__PURE__ */ g("span", {
							className: "kt-file-num kt-mono",
							children: [/* @__PURE__ */ g("span", {
								className: "kt-add",
								children: ["+", e.added]
							}), e.removed > 0 && /* @__PURE__ */ g("span", {
								className: "kt-del",
								children: [" −", e.removed]
							})]
						})
					]
				}, e.path)), t.length > o.length && /* @__PURE__ */ g("li", {
					className: "kt-more kt-dim",
					children: [
						"还有 ",
						t.length - o.length,
						" 个文件"
					]
				})]
			}),
			/* @__PURE__ */ g("ul", {
				className: "kt-commits br-commit-rows",
				"aria-label": "提交",
				children: [e.slice().reverse().slice(0, 3).map((e) => /* @__PURE__ */ g("li", {
					className: e.records_only ? "is-records" : "",
					children: [
						/* @__PURE__ */ h("code", { children: e.sha.slice(0, 8) }),
						/* @__PURE__ */ h("span", {
							className: "br-commit-subj",
							title: e.text,
							children: e.kind === "handover" ? `交接：${e.text}` : e.text
						}),
						!t.length && /* @__PURE__ */ g("span", {
							className: "br-commit-files",
							title: `${e.files} 个文件`,
							children: [/* @__PURE__ */ h("span", {
								className: "kt-file-bar",
								"aria-hidden": "true",
								children: /* @__PURE__ */ h("i", {
									className: "kt-bar-add",
									style: { width: `${e.files / a * 100}%` }
								})
							}), /* @__PURE__ */ g("span", {
								className: "kt-mono",
								children: [
									e.files,
									" 个文件",
									e.records_only ? " · 只改记录" : ""
								]
							})]
						})
					]
				}, `${e.kind}-${e.sha}`)), e.length > 3 && /* @__PURE__ */ g("li", {
					className: "kt-more kt-dim",
					children: [
						"还有 ",
						e.length - 3,
						" 次提交：看提交传送带"
					]
				})]
			})
		]
	});
}
function fs(e) {
	let t = e.events.map((e) => e.at), n = Math.min(e.started_at ?? Infinity, ...t), r = Number.isFinite(n) ? n : e.at, i = t.length ? Math.max(...t) : r;
	return {
		start: r,
		end: Math.max(e.ended_at ?? i, i, r + 1)
	};
}
function ps(e, t = 900) {
	let n = fs(e), r = [.../* @__PURE__ */ new Set([
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
var ms = (e) => ({
	status: "waiting",
	doing: e.status === "waiting" ? e.doing : "还没轮到",
	since: null
});
function hs(e, t) {
	if (t >= fs(e).end) return e;
	let n = /* @__PURE__ */ new Map(), r = e.events.find((e) => e.kind === "start")?.at ?? -Infinity, i = e.events.find((e) => e.kind === "session")?.at, a = (t) => {
		let n = e.actors.find((e) => e.key === t);
		return n ? Math.min(Infinity, ...n.history.map((e) => e.at), ...n.spans.map((e) => e.a)) : Infinity;
	}, o = (e) => e.kind === "runner" ? e.opened_at ?? a("runner") : Math.max(i ?? e.opened_at ?? a("local"), r), s = (t) => {
		let n = e.sessions.find((e) => e.slot === t.session?.slot);
		return o({
			kind: t.key === "runner" ? "runner" : "local",
			opened_at: n?.opened_at ?? null
		});
	}, c = e.actors.map((r) => {
		let i = [...r.history].reverse().find((e) => e.at <= t);
		i?.status === "awaiting_approval" && n.set(r.key, i.who ?? (e.person.me ? "you" : "people"));
		let a = r.status === "skipped" && !r.history.length, o = i ? {
			status: i.status,
			doing: i.doing,
			since: i.at
		} : a ? {
			status: r.status,
			doing: r.doing,
			since: null
		} : ms(r);
		return {
			...r,
			...o,
			line: null,
			session: r.session && s(r) <= t ? r.session : null,
			spans: r.spans.filter((e) => e.a <= t).map((e) => ({
				...e,
				b: e.b !== null && e.b <= t ? e.b : null
			})),
			marks: r.marks.filter((e) => e.at <= t),
			facts: [],
			credits: null
		};
	}), l = new Map(c.map((e) => [e.key, e.status])), u = e.checks.cells.map((e) => e.at !== null && e.at <= t || e.at === null && e.status === "wait" && e.actor && l.get(e.actor) === "awaiting_approval" ? e : {
		...e,
		status: "skip",
		at: null,
		detail: "还没到这一步"
	}), d = u.filter((e) => e.status === "pass").length, f = u.filter((e) => e.status === "fail").length, p = c.filter((e) => e.status === "awaiting_approval"), m = p.find((e) => n.get(e.key) === "you") ?? p[0], h = c.some((e) => e.status === "running" || e.status === "fixing"), g = l.get("release"), _ = e.ended_at !== null && e.ended_at <= t, v = _s(e, t, l, _), y = pr(e.events, t, e.row.lean.total), b = y.done_n + y.skipped_n, x = m ? n.get(m.key) ?? "people" : h ? l.get("runner") === "running" ? "runner" : "agent" : "nobody", S = v === "claimed", C = e.events.find((e) => e.kind === "claim")?.at ?? null, w = ir(e) ? "已认领，还没开工" : `等 ${e.person.owner} 开工`;
	return {
		...e,
		row: {
			...e.row,
			state: v,
			state_label: gs[v],
			credits: null,
			mr: e.events.some((e) => e.kind === "handover" && e.at <= t) ? e.row.mr : null,
			...S ? {
				branch: null,
				worktree: null
			} : {},
			lean: {
				...e.row.lean,
				done_n: y.done_n,
				skipped_n: y.skipped_n,
				next: y.next,
				done: b,
				stage: y.next?.id ?? null,
				stage_label: y.next?.label ?? null,
				stage_n: y.next?.n ?? null,
				stage_state: y.next ? y.started ? "started" : "todo" : b ? "done" : null
			},
			waits: S ? {
				...e.row.waits,
				who: ir(e) ? "you" : "people",
				text: w,
				line: null,
				raw: "",
				do: "start",
				since: C
			} : {
				...e.row.waits,
				who: x,
				text: m ? m.doing : h ? "AI 在做" : "",
				line: null,
				raw: "",
				do: "none",
				since: m?.since ?? null
			}
		},
		branch: S ? null : e.branch,
		ended_at: _ ? e.ended_at : null,
		live: h,
		person: S ? {
			...e.person,
			status: ir(e) ? "awaiting_approval" : "waiting",
			doing: w
		} : {
			...e.person,
			status: x === "you" ? "awaiting_approval" : h && !m ? "running" : "waiting",
			doing: m ? m.doing : h ? "AI 在做" : "没有等你的事"
		},
		actors: S ? c.map((e) => e.key === "local" ? {
			...e,
			doing: "认领了，还没开工"
		} : e) : c,
		events: e.events.filter((e) => e.at <= t),
		belt: e.belt.filter((e) => e.at <= t),
		sessions: e.sessions.filter((e) => o(e) <= t),
		credits: {
			...e.credits,
			total: null
		},
		decisions: [],
		brain: {
			...e.brain,
			cited: [],
			stale: [],
			unknown: []
		},
		checks: {
			...e.checks,
			cells: u,
			passed: d,
			failed: f,
			total: u.filter((e) => e.status === "pass" || e.status === "fail" || e.status === "wait").length,
			todo: void 0,
			at: Math.max(0, ...u.filter((e) => e.at !== null).map((e) => e.at)) || null,
			history: e.checks.history.filter((e) => e.at <= t)
		},
		accept: {
			...e.accept,
			state: g === "awaiting_approval" ? "waiting" : g === "merged" ? "accepted" : g === "fixing" ? "rejected" : "not_yet",
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
var gs = {
	claimed: "已认领",
	local: "本地开发中",
	handed_over: "已交接",
	rejected: "接手被拒",
	running: "运行机在跑",
	parked: "停下等回答",
	acceptance: "等验收",
	merged: "已合并",
	closed: "已关闭",
	unclaimed: "待认领",
	merged_into_parent: "已合进大需求"
};
function _s(e, t, n, r) {
	if (r) return e.row.state === "closed" ? "closed" : "merged";
	let i = (n) => e.events.some((e) => e.kind === n && e.at <= t);
	return n.get("release") === "awaiting_approval" ? "acceptance" : i("handover") ? n.get("handover") === "failed" ? "rejected" : ["bridge", "runner"].some((e) => n.get(e) === "awaiting_approval") ? "parked" : n.get("runner") === "running" || n.get("runner") === "fixing" ? "running" : "handed_over" : i("start") || e.events.some((e) => e.kind !== "claim" && e.at <= t) ? "local" : "claimed";
}
var vs = [
	1,
	2,
	4
];
function ys(e, t) {
	let [r, a] = c({
		on: !1,
		p: 0,
		speed: 1,
		playing: !1
	}), l = s(null), u = s(null), d = s(!1);
	r.on || (l.current = e);
	let f = r.on ? l.current : null, p = o(() => f ? ps(f) : null, [f]), m = o(() => f ? fs(f) : null, [f]), h = p?.total ?? 0, g = p ? p.toReal(r.p) : 0, _ = n((t) => {
		l.current = e, u.current = null;
		let n = t !== void 0 && e ? ps(e).toPlay(t) : 0;
		a({
			on: !0,
			p: n,
			speed: 1,
			playing: t === void 0
		});
	}, [e]), v = n(() => {
		u.current = null, a({
			on: !1,
			p: 0,
			speed: 1,
			playing: !1
		});
	}, []), y = n(() => a((e) => e.p >= h ? (d.current = !0, u.current = null, {
		...e,
		p: 0,
		playing: !0
	}) : {
		...e,
		playing: !e.playing
	}), [h]), b = n(() => a((e) => ({
		...e,
		playing: !1
	})), []), x = n((e) => {
		d.current = !0, a((t) => ({
			...t,
			p: e
		}));
	}, []), S = n((e) => a((t) => ({
		...t,
		speed: e
	})), []);
	i(() => {
		if (!r.on || !r.playing || !h) return;
		let e = h / 60 * (250 / 1e3), t = setInterval(() => a((t) => {
			let n = Math.min(h, t.p + e * t.speed);
			return {
				...t,
				p: n,
				playing: n < h
			};
		}), 250);
		return () => clearInterval(t);
	}, [
		r.on,
		r.playing,
		h
	]);
	let C = o(() => f && m ? hs(f, g) : null, [
		f,
		m,
		g
	]);
	i(() => {
		if (!C) return;
		let e = Math.max(30, h / 60 * r.speed * (250 / 1e3) * 2), n = vo(u.current, C, {
			at: g,
			resync: d.current,
			lateS: e
		});
		d.current = !1, u.current = C, t(n);
	}, [C]);
	let w = o(() => C ? {
		at: g,
		receivedAt: Infinity
	} : null, [C, g]), T = !!f && (f.ended_at !== null || f.row.state === "merged" || f.row.state === "closed");
	return {
		on: r.on,
		board: C,
		clock: w,
		span: m,
		p: r.p,
		total: h,
		t: g,
		finished: T,
		speed: r.speed,
		playing: r.playing,
		start: _,
		exit: v,
		toggle: y,
		pause: b,
		seek: x,
		setSpeed: S
	};
}
function bs({ rp: e }) {
	if (!e.on || !e.span) return null;
	let t = e.p >= e.total;
	return /* @__PURE__ */ g("div", {
		className: "kt-replay",
		role: "group",
		"aria-label": "回放",
		"data-testid": "br-replay",
		children: [
			/* @__PURE__ */ h("span", {
				className: "kt-pill tone-info",
				children: "回放"
			}),
			/* @__PURE__ */ h("button", {
				type: "button",
				className: "kt-btn kt-btn-icon",
				onClick: e.toggle,
				"aria-label": e.playing ? "暂停" : t ? "从头再放" : "播放",
				title: e.playing ? "暂停" : t ? "从头再放" : "播放",
				children: e.playing ? "⏸" : t ? "↺" : "▶"
			}),
			/* @__PURE__ */ h("input", {
				type: "range",
				className: "kt-replay-scrub",
				"aria-label": "回放进度",
				min: 0,
				max: Math.max(1, Math.round(e.total)),
				step: 1,
				value: Math.min(e.total, Math.round(e.p)),
				onChange: (t) => e.seek(Number(t.target.value))
			}),
			/* @__PURE__ */ g("span", {
				className: "kt-mono kt-replay-time",
				title: "这一刻的真实时间",
				children: [
					Wn(e.t),
					" · 第 ",
					Bn(e.t - e.span.start)
				]
			}),
			/* @__PURE__ */ h("span", {
				className: "kt-replay-speeds",
				role: "radiogroup",
				"aria-label": "倍速",
				children: vs.map((t) => /* @__PURE__ */ g("button", {
					type: "button",
					role: "radio",
					"aria-checked": e.speed === t,
					className: `kt-btn${e.speed === t ? " is-on" : ""}`,
					onClick: () => e.setSpeed(t),
					children: [t, "×"]
				}, t))
			}),
			/* @__PURE__ */ h("span", {
				className: "kt-dim kt-replay-note",
				children: t ? e.finished ? "放完了：下面是这个需求最后的样子" : "放到现在了：它还在进行" : !e.playing && e.p > 0 ? "停在这一刻：按 ▶ 接着放" : "按记录重放：安静的时段缩短了，不调用 agent"
			}),
			/* @__PURE__ */ h("button", {
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
function xs(e, t) {
	let r = t.pollMs ?? 2e3, [a, o] = c({
		board: null,
		error: "",
		missing: !1,
		loading: !0,
		receivedAt: 0
	}), l = ui(e), u = ui(t.onDiff), d = E.board(t.repo, t.reqKey), f = ui(d), p = s(!1), m = s(null), h = s(!1), g = s(() => {}), _ = n(async () => {
		if (p.current) return;
		p.current = !0;
		let e = f.current;
		try {
			let t = await l.current.get(e);
			if (e !== f.current) return;
			let n = typeof document > "u" || !document.hidden, r = vo(m.current, t, {
				at: t.at,
				resync: h.current
			});
			m.current = t, n && (h.current = !1), o({
				board: t,
				error: "",
				missing: !1,
				loading: !1,
				receivedAt: Date.now()
			}), u.current?.(r, t);
		} catch (t) {
			if (e !== f.current) return;
			o((e) => ({
				...e,
				error: j(t),
				missing: M(t) === 404,
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
	i(() => {
		let e, t = !0, n = 0;
		m.current = null;
		let i = (t) => {
			clearTimeout(e);
			let r = ++n;
			e = setTimeout(() => void a(r), t);
		}, a = async (e) => {
			t && e === n && (document.hidden ? h.current = !0 : (await _(), t && e === n && r > 0 && i(r)));
		}, o = () => {
			document.hidden ? (h.current = !0, clearTimeout(e), n++) : i(0);
		};
		return g.current = () => i(0), i(0), document.addEventListener("visibilitychange", o), () => {
			t = !1, clearTimeout(e), g.current = () => {}, document.removeEventListener("visibilitychange", o);
		};
	}, [
		_,
		r,
		d
	]);
	let v = n(() => g.current(), []);
	return {
		...a,
		reload: v
	};
}
//#endregion
//#region src/board/BoardPage.tsx
var Ss = {
	req: null,
	flips: {},
	flashes: {},
	bumps: {},
	belt: /* @__PURE__ */ new Set(),
	fresh: /* @__PURE__ */ new Set(),
	announce: ""
};
function Cs(e, t) {
	if (t.first || e.req !== t.req) return {
		...Ss,
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
function ws(e) {
	let t = e.actors.filter((e) => Pn.has(e.status) || e.status === "awaiting_approval");
	return t.sort((e, t) => (t.since ?? 0) - (e.since ?? 0)), t[0]?.key ?? null;
}
var Ts = (e) => `${e.actors.map((e) => e.key).join(",")}|${+!!e.direct}|${Ia(e)}|${Xi(e.actors).join(",")}`;
function Es(e) {
	return !e.error || e.row.state === "claimed" ? null : /[A-Za-z]{4,}/.test(e.error.replace(/brain-kit|Lean|KiroCrew/g, "")) ? {
		text: "这个需求的运行记录没读全：图上只画了 Lean 的记录和仓库里看得到的",
		todo: "到需求详情看细节；一直这样的话，到设置里看 brain-kit 能不能用",
		raw: e.error
	} : {
		text: e.error,
		todo: "",
		raw: ""
	};
}
function Ds({ entry: e, onBack: t, onSwitch: r, onMissing: a, go: l, replace: d, status: p, pollMs: _, reloadStatus: v }) {
	let y = u(), b = f(), x = pi(), [S, C] = c(null), [w, T] = c(!1), [E, D] = c(Ss), O = s(null), k = s(null), A = s(!1), j = n((e) => {
		e.items.length && O.current?.(e.items), D((t) => Cs(t, e));
	}, []), M = n((e) => void (A.current || j(e)), [j]), N = xs(y, {
		repo: e.repo,
		reqKey: e.key,
		pollMs: _,
		onDiff: M
	}), P = N.missing && !N.board, ee = Jr(e.repo, e.key, p, _), F = r ?? ((e, t) => l({
		kind: "board",
		repo: e,
		key: t
	}));
	i(() => {
		(P || N.board) && a?.(P);
	}, [P, !!N.board]);
	let te = tn(e.repo, e.key, () => {
		N.reload(), v();
	}), I = ys(N.board, j);
	A.current = I.on;
	let L = I.board ?? N.board;
	i(() => D(Ss), [I.on]);
	let R = s(!!e.replay || !!e.at), z = s(!1);
	i(() => {
		if (!z.current || I.on === R.current) return;
		R.current = I.on;
		let { replay: t, at: n, ...r } = e;
		d({
			kind: "board",
			...r,
			...I.on ? { replay: !0 } : {}
		});
	}, [I.on]), i(() => {
		if (z.current || !N.board) return;
		z.current = !0, e.at ? I.start(e.at) : e.replay && I.start();
		let t = e.focus === "accept" ? "#br-accept" : e.focus === "checks" ? "[data-testid=\"kt-wall\"]" : e.focus === "lanes" ? "[data-testid=\"kt-lanes\"]" : e.focus === "feed" ? "[data-testid=\"kt-feed\"]" : e.replay || e.at ? "[data-testid=\"kt-graph\"]" : "";
		t && setTimeout(() => k.current?.querySelector(t)?.scrollIntoView?.({
			behavior: "smooth",
			block: "start"
		}), 80);
	}, [N.board]);
	let B = N.board, V = B ? Ts(B) : "", [ne, re] = c(null), H = s(null), ie = n((e) => {
		if (H.current?.disconnect(), !e || typeof ResizeObserver > "u") return;
		let t = () => {
			let t = e.firstElementChild?.clientWidth || e.clientWidth;
			t > 0 && re((e) => e !== null && Math.abs(e - t) < 8 ? e : t);
		};
		t(), H.current = new ResizeObserver(t), H.current.observe(e);
	}, []);
	i(() => () => H.current?.disconnect(), []);
	let ae = o(() => {
		if (!B) return null;
		let e = Xi(B.actors), t = B.actors.map((e) => e.key).filter((t) => !e.includes(Mi[t]?.phase ?? "")), n = ea(ne, e);
		return ta(t, Yi(new Set(t), B.direct, n.compact), Ia(B), e, n.width, n.compact);
	}, [V, ne]), U = o(() => ({
		at: N.board?.at ?? Date.now() / 1e3,
		receivedAt: N.receivedAt || Date.now()
	}), [N.board?.at, N.receivedAt]), G = I.clock ?? U, oe = n((e) => C((t) => t === e ? null : e), []), se = w && L ? ws(L) : null;
	i(() => {
		se && k.current?.querySelector(`[data-testid="kt-lane"][data-role="${se}"]`)?.scrollIntoView?.({
			block: "nearest",
			behavior: x ? "auto" : "smooth"
		});
	}, [se, x]), i(() => {
		let e = (e) => e.key === "Escape" && C(null);
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, []);
	let ce = () => l({
		kind: "item",
		repo: e.repo,
		key: e.key,
		from: "board"
	}), le = W[e.from ?? "overview"], ue = () => l({
		kind: "brain",
		repo: e.repo,
		reflect: e.key
	}), K = p?.repos.find((t) => t.id === e.repo)?.me?.name ?? null, de = !!L && e.repo !== "runner" && (L.person.you ?? (L.person.me || !L.person.owner || !K)), q = () => l({
		kind: "new",
		repo: e.repo,
		key: e.key,
		...L?.row.title ? { title: L.row.title } : {}
	}), fe = (t) => l({
		kind: "board",
		repo: e.repo,
		key: t
	}), pe = n((e, t) => {
		let n = (L?.actors.find((t) => t.key === e))?.session?.url ?? L?.actors.find((e) => e.key === "local")?.session?.url, r = !!L && Ta(L.row.waits);
		if ((t === "reply" && !r || t === "tool") && n) return b(n);
		if (t === "write_back") return ue();
		k.current?.querySelector(t === "accept" && !k.current?.querySelector("#br-next") ? "#br-accept" : "#br-next")?.scrollIntoView?.({
			behavior: "smooth",
			block: "center"
		}), C(e);
	}, [L, b]), me = I.on, he = L ? L.questions.filter((e) => (e.state === "waiting" || e.state === "open") && !(L.row.waits.who === "you" && Sa(e))) : [], ge = !L || L.row.waits.who === "you" ? null : rr.has(L.row.waits.who) ? Qn(L) : "等人", _e = !!L && L.accept.state !== "not_yet", ve = L ? Es(L) : null, J = L?.row.family ?? null, ye = de && J?.role !== "child" ? q : void 0, be = !!L && (L.row.state === "claimed" || L.row.state === "unclaimed") && !I.on, xe = L && J && /* @__PURE__ */ h(nn, {
		f: J,
		repo: e.repo,
		reqKey: e.key,
		ctl: te,
		look: "board",
		go: l,
		rollup: L.rollup,
		quiet: me
	});
	return /* @__PURE__ */ g("main", {
		ref: k,
		className: `kt-root br-view br-board${L?.live && !me ? " is-live" : ""}`,
		"data-testid": "br-board",
		"data-motion": x ? "reduce" : void 0,
		children: [/* @__PURE__ */ h("style", { children: wo }), /* @__PURE__ */ g(yi.Provider, {
			value: G,
			children: [
				/* @__PURE__ */ g("div", {
					className: "cto-top br-where-row",
					children: [
						/* @__PURE__ */ g("nav", {
							className: "kit-crumb kt-where",
							"aria-label": "位置",
							"data-testid": "kt-where",
							children: [
								/* @__PURE__ */ h("button", {
									type: "button",
									onClick: t ?? (() => l({ kind: "overview" })),
									children: le
								}),
								/* @__PURE__ */ h("span", {
									"aria-hidden": "true",
									children: "›"
								}),
								J?.role === "child" && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("button", {
									type: "button",
									onClick: () => fe(J.parent),
									title: `大需求 ${J.parent} 的需求看板`,
									children: J.parent
								}), /* @__PURE__ */ h("span", {
									"aria-hidden": "true",
									children: "›"
								})] }),
								P ? /* @__PURE__ */ h("span", {
									"data-testid": "kt-where-key",
									children: e.key
								}) : /* @__PURE__ */ h("button", {
									type: "button",
									onClick: ce,
									title: "需求详情",
									children: e.key
								}),
								/* @__PURE__ */ h("span", {
									"aria-hidden": "true",
									children: "›"
								}),
								/* @__PURE__ */ g("b", { children: [
									"需求看板",
									S && L ? ` · ${L.actors.find((e) => e.key === S)?.title ?? ""}` : "",
									I.on ? " · 回放" : ""
								] })
							]
						}),
						/* @__PURE__ */ h("span", { className: "cto-grow" }),
						!I.on && /* @__PURE__ */ h(Xr, {
							repo: e.repo,
							reqKey: e.key,
							status: p,
							pollMs: _,
							onPick: F
						}),
						t && /* @__PURE__ */ g("button", {
							type: "button",
							className: "kt-btn",
							onClick: t,
							children: ["← 返回", le]
						})
					]
				}),
				ee && !I.on && /* @__PURE__ */ h(Yr, {
					reqKey: e.key,
					what: "需求看板",
					onOpen: () => F("runner", e.key)
				}),
				N.missing && !L ? !ee && /* @__PURE__ */ h(Zr, {
					repoName: p?.repos.find((t) => t.id === e.repo)?.name ?? (e.repo === "runner" ? "运行机" : null),
					reqKey: e.key,
					backName: t ? le : W.overview,
					onBack: t ?? (() => l({
						kind: "overview",
						...e.repo === "runner" ? {} : { repo: e.repo }
					})),
					testId: "br-board-missing"
				}) : /* @__PURE__ */ h(zt, {
					loading: N.loading,
					error: N.error,
					has: !!L
				}),
				L && ae && /* @__PURE__ */ g(m, { children: [
					/* @__PURE__ */ h(Mo, {
						board: L,
						replaying: I.on,
						follow: w,
						onReplay: () => I.start(),
						onFollow: () => T((e) => !e),
						onDetail: ce,
						onSession: (e) => b(e),
						onStart: ye,
						onParent: fe,
						onFamily: () => k.current?.querySelector("[data-testid=\"fam-panel\"]")?.scrollIntoView?.({
							behavior: "smooth",
							block: "start"
						})
					}),
					/* @__PURE__ */ h(bs, { rp: I }),
					ve && /* @__PURE__ */ g("div", {
						className: "kt-banner br-problem",
						role: "status",
						"data-testid": "br-board-problem",
						children: [
							/* @__PURE__ */ h("b", { children: ve.text }),
							ve.todo && /* @__PURE__ */ g("span", { children: ["做什么：", ve.todo] }),
							ve.raw && /* @__PURE__ */ g("details", {
								className: "br-raw",
								children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: ve.raw })]
							})
						]
					}),
					be ? /* @__PURE__ */ g(m, { children: [xe, /* @__PURE__ */ h(Ko, {
						board: L,
						onStart: ye
					})] }) : /* @__PURE__ */ g(m, { children: [
						!me && /* @__PURE__ */ h(To, {
							board: L,
							repo: e.repo,
							reqKey: e.key,
							onAnswered: N.reload,
							onBrain: ue,
							onDetail: ce
						}),
						/* @__PURE__ */ h(Po, {
							board: L,
							reducedMotion: x,
							onActor: oe,
							replaying: I.on
						}, `${I.on ? "replay" : "live"}`),
						_e && /* @__PURE__ */ h(ii, {
							board: L,
							onDetail: ce,
							quiet: me
						}),
						J?.role === "big" && xe,
						/* @__PURE__ */ g("div", {
							className: "kt-body",
							children: [/* @__PURE__ */ g("div", {
								className: "kt-col",
								children: [
									/* @__PURE__ */ h("div", {
										ref: ie,
										children: /* @__PURE__ */ h(La, {
											board: L,
											lay: ae,
											focus: S,
											onActor: oe,
											flashes: E.flashes,
											reducedMotion: x,
											feed: O,
											quiet: me,
											onSession: (e) => b(e),
											onAct: me ? void 0 : pe
										}, `${e.repo}/${e.key}${I.on ? ":replay" : ""}`)
									}),
									S && /* @__PURE__ */ h(Os, {
										board: L,
										focus: S,
										onClear: () => C(null)
									}),
									/* @__PURE__ */ h(xo, {
										board: L,
										fresh: E.belt,
										focus: S,
										onActor: oe
									}),
									(J?.role === "parent" || J?.role === "child") && xe,
									/* @__PURE__ */ h(qo, {
										board: L,
										focus: S,
										bumps: E.bumps,
										onActor: oe,
										quiet: me
									}),
									!_e && /* @__PURE__ */ h(ii, {
										board: L,
										onDetail: ce,
										quiet: me
									})
								]
							}), /* @__PURE__ */ g("aside", {
								className: "kt-side",
								"aria-label": "检查、问题和事件",
								children: [
									/* @__PURE__ */ h(ao, {
										board: L,
										focus: S,
										onActor: oe,
										flips: E.flips,
										onSettings: () => l({ kind: "settings" })
									}),
									!me && he.length > 0 && /* @__PURE__ */ g("section", {
										className: "kt-card br-board-qs",
										"aria-label": "等回答的问题",
										"data-testid": "br-board-questions",
										children: [/* @__PURE__ */ g("header", {
											className: "kt-card-head",
											children: [/* @__PURE__ */ h("h2", { children: "等回答的问题" }), /* @__PURE__ */ h("span", {
												className: `kt-badge tone-${L.row.waits.who === "you" ? "approve" : "info"}`,
												children: he.length
											})]
										}), he.map((t, n) => /* @__PURE__ */ h(Ir, {
											q: t,
											repo: e.repo,
											reqKey: e.key,
											onAnswered: N.reload,
											waiter: ge
										}, `${t.id ?? "q"}-${n}`))]
									}),
									/* @__PURE__ */ h(So, {
										board: L,
										focus: S,
										onActor: oe,
										fresh: E.fresh
									})
								]
							})]
						})
					] })
				] }),
				/* @__PURE__ */ h("div", {
					className: "kt-sr",
					"aria-live": "polite",
					"data-testid": "kt-announce",
					children: E.announce
				})
			]
		})]
	});
}
function Os({ board: e, focus: t, onClear: n }) {
	let r = e.actors.find((e) => e.key === t);
	return r ? /* @__PURE__ */ g("div", {
		className: "kt-focuschip",
		role: "status",
		"data-testid": "kt-focusbar",
		children: [
			/* @__PURE__ */ h(Y, {
				role: r.icon,
				size: 14
			}),
			" ",
			r.title,
			/* @__PURE__ */ h("button", {
				type: "button",
				onClick: n,
				"aria-label": "看全部",
				title: "看全部（Esc）",
				children: "✕"
			})
		]
	}) : null;
}
var ks = `
.kt-root, .br-app {
  --kt-run: #3cc4ff; --kt-fix: #ff9f43; --kt-ok: #3ee08f; --kt-ok-solid: #0b7a4b; --kt-done: #7fe3b8;
  --kt-queue: #9ba6ff; --kt-warn: #ffc53d; --kt-approve: #ff6ec7; --kt-bad: #ff5d6c; --kt-bad-solid: #c4253a;
  --kt-handoff: #b48cff; --kt-info: #8fb8ff; --kt-idle: var(--muted, #938f9b);
  --kt-on: #16121b; --kt-seg-l: .74; --kt-seg-c: .12; --kt-glass: color-mix(in srgb, var(--text, #dcdadf) 4%, transparent);
}
.kt-root {
  container: kt-root / inline-size;
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
@container kt-root (max-width: 1240px) { .kt-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } .kt-kpi-par, .kt-kpi-gates { grid-column: span 2; order: -1; } }
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
@container kt-root (max-width: 1640px) { .kt-body { grid-template-columns: minmax(0, 1fr); } .kt-side { position: static; max-height: none; } .kt-side .kt-feed-list { max-height: 460px; } }

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
.kt-file-path.is-split { display: flex; }
.kt-file-dir { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
.kt-file-base { flex: none; }
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
@container kt-root (max-width: 1000px) { .kt-team-intro { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.kt-team-intro.is-phased { grid-template-columns: 1.15fr 1.15fr 1.6fr .8fr; align-items: stretch; gap: 14px; }
@container kt-root (max-width: 1000px) { .kt-team-intro.is-phased { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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
@container kt-root (max-width: 900px) { .kt-files-pane { grid-template-columns: minmax(0, 1fr); } }

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
`, As = "--bg: #fff; --bg-hover: #f0f0f0; --card: #fff; --text: #4a464f; --text-strong: #19161d; --muted: #5e5966;\n  --border: #e4e4e7; --border-strong: #d4d4d8; --kt-approve: #b8237a; --kt-ok: #0a7d45;", js = "--s1: #2a78d6; --s2: #eb6834; --s3: #b9b6bf; --s4: #6250d6; --deemph: #b9b6bf; --cto-cell: #f7f7f8; --vs-person: #e87ba4; --vs-rework: #eda100;", Ms = `
.cto-root { --s1: #3987e5; --s2: #d95926; --s3: #6b6673; --s4: #9085e9; --deemph: #6b6673; --cto-cell: var(--bg, #19161d);
  --vs-agent: var(--s4); --vs-person: #d55181; --vs-rework: #c98500;
  --cto-wash: color-mix(in srgb, var(--accent) 10%, transparent); --cto-fresh: color-mix(in srgb, var(--accent) 16%, transparent);
  --cto-glass: color-mix(in srgb, var(--text) 4%, transparent); gap: 16px; }
:root[data-mode="light"] .cto-root { ${js} }
.cto-root.is-printing { ${As} ${js} background: #fff; color: #4a464f; }
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
`, Ns = ".kt-kpi, .cto-cards > .cto-card, .br-kpi", Ps = ".kt-card, .kt-experts, .kt-kb, .kt-sign, .kt-start, .cto-root > section.cto-card, .br-card", Fs = `
.kt-root { --kit-r: 16px; --kit-r-cell: 10px; --kit-pad-kpi: 16px 18px; --kit-pad-block: 16px 20px; --kit-gap-row: 12px; --kit-gap-block: 16px;
  --kit-ok: color-mix(in srgb, var(--kt-ok) 55%, var(--border)); --kit-wait: color-mix(in srgb, var(--kt-approve) 55%, var(--border));
  --kit-run: color-mix(in srgb, var(--kt-run) 55%, var(--border)); --kit-bad: color-mix(in srgb, var(--kt-bad) 55%, var(--border)); gap: var(--kit-gap-block); }
${`${Ns}, ${Ps}, .kt-graph, .kt-lane`} { border-radius: var(--kit-r); border: 1px solid var(--border); }
${Ns}, ${Ps} { background-color: var(--card); }
${Ns} { position: relative; overflow: hidden; padding: var(--kit-pad-kpi); }
.kt-kpi::after, .cto-cards > .cto-card::after, .br-kpi::after { content: ''; position: absolute; inset: 0; pointer-events: none; border-radius: inherit;
  background: radial-gradient(90% 70% at 100% 0%, color-mix(in srgb, var(--text) 4%, transparent), transparent 70%); }
${Ps} { padding: var(--kit-pad-block); margin: 0; }
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
`, Is = [
	"ok",
	"run",
	"wait",
	"hand",
	"bad",
	"warn",
	"info",
	"idle"
], Ls = {
	ok: "ok",
	run: "run",
	wait: "approve",
	hand: "handoff",
	bad: "bad",
	warn: "warn",
	info: "info",
	idle: "idle"
}, Rs = `
.br-app { --br-ok: var(--kt-ok); --br-run: var(--kt-run); --br-wait: var(--kt-approve); --br-hand: var(--kt-handoff); --br-bad: var(--kt-bad);
  --br-warn: var(--kt-warn); --br-info: var(--kt-info); --br-idle: var(--kt-idle); --br-tone: var(--kt-idle);
  --br-cell: color-mix(in srgb, var(--text, #dcdadf) 5%, transparent);
  display: flex; flex-direction: column; min-height: 100%; box-sizing: border-box; color: var(--text);
  font-family: var(--font-body, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); font-size: 14px; line-height: 1.5; }
.br-app *, .br-app *::before, .br-app *::after { box-sizing: border-box; }
${Is.map((e) => `.br-app .tone-${e} { --br-tone: var(--kt-${Ls[e]}); --kt-tone: var(--kt-${Ls[e]}); }`).join("\n")}
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
/* a tab that cannot open (the requirement in hand is not there): looks and feels off in both modes, no hand cursor */
.br-tabs button[aria-disabled="true"], .br-tabs button[aria-disabled="true"]:hover { color: var(--muted); opacity: .45; cursor: not-allowed; }
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
.br-switch { display: inline-flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; font-weight: 600; white-space: nowrap; }
.br-switch .kt-select { max-width: 340px; color: var(--text-strong); }
/* ---------- Markdown shown as text (views/Markdown.tsx: a 变更说明's 看全文) ---------- */
.br-md { display: grid; gap: 8px; margin-top: 8px; font-size: 14px; color: var(--text); line-height: 1.6; }
.br-md > * { margin: 0; min-width: 0; }
.br-md :is(h4, h5) { margin: 6px 0 0; color: var(--text-strong); font-weight: 700; }
.br-md h4 { font-size: 1.08em; }
.br-md h5 { font-size: 1em; }
.br-md :is(ul, ol) { padding-left: 1.4em; display: grid; gap: 2px; }
.br-md hr { border: 0; border-top: 1px solid var(--border); }
.br-md pre { padding: 8px 10px; border-radius: 8px; background: var(--bg); border: 1px solid var(--border); white-space: pre-wrap; word-break: break-word; }
.br-md .cto-table { font-size: 13px; }
.br-md .cto-table td { color: var(--text); }
.br-md .cto-table td:first-child { white-space: nowrap; }
.br-md code, .br-inline code { padding: 0 4px; border-radius: 5px; background: color-mix(in srgb, var(--text) 8%, transparent); overflow-wrap: anywhere; }
.br-mdfold > summary { font-size: 13px; }
/* ---------- a command a person types in a terminal (ui.tsx CommandLine) ---------- */
.br-cmd { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; min-width: 0; }
.br-cmd code { padding: 3px 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--kt-glass); color: var(--text-strong); font-size: .92em; user-select: all; word-break: break-all; }
`, zs = {
	PRODUCT: "产品",
	TECH: "技术",
	IMPROVEMENT: "改进",
	PROJECT: "项目"
}, Bs = {
	principle: "原则",
	correction: "纠正",
	decision: "决定",
	model: "模型",
	guideline: "准则",
	pitfall: "坑",
	process: "流程"
}, Vs = {
	product: "产品",
	builder: "开发",
	shared: "共用"
}, Hs = {
	new: "新",
	same: "只加来源",
	"adds-to": "补充",
	replaces: "取代",
	repeats: "又出现",
	withdraws: "撤回"
}, Us = /* @__PURE__ */ new Set([
	"adds-to",
	"replaces",
	"repeats",
	"withdraws"
]), Ws = {
	new: "ok",
	same: "idle",
	"adds-to": "info",
	replaces: "warn",
	repeats: "warn",
	withdraws: "bad"
}, Gs = (e) => {
	let [t, ...n] = e.split(" ");
	return Hs[t] ? [Hs[t], ...n].join(" ") : e;
}, Ks = (e) => Ws[e.split(" ")[0]] ?? "idle", qs = (e, t) => e.sections.some((e) => e.entries.some((e) => e.id === t)), Js = (e) => e.sections.flatMap((e) => e.entries);
function Ys(e, t, n) {
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
var Xs = (e) => [...e.errors, ...e.warnings];
function Zs({ text: e }) {
	let t = e.split(/(`[^`\n]+`)/);
	return /* @__PURE__ */ h(m, { children: t.map((e, t) => e.length > 2 && e.startsWith("`") && e.endsWith("`") ? /* @__PURE__ */ h("code", {
		className: "bv-code",
		children: e.slice(1, -1)
	}, t) : e) });
}
var Qs = [
	{
		icon: "release",
		title: "做完一个需求",
		text: "AI 记下决定和学到的"
	},
	{
		icon: "merge",
		title: "合并",
		text: "进默认分支"
	},
	{
		icon: "brain",
		title: "回写",
		text: "先预览，再写进新分支"
	},
	{
		icon: "laptop",
		title: "下一次用上",
		text: "运行加载它，用上了就引用"
	}
];
function $s({ entry: e, ...t }) {
	let n = u(), r = C(), a = t.status?.repos ?? [], l = a.filter((e) => e.ok), [d, f] = c(e.repo ?? ""), p = l.length > 0 ? a.find((e) => e.id === d && !e.ok) : void 0, _ = p ? "" : d && (!t.status || l.some((e) => e.id === d)) ? d : l[0]?.id ?? "", v = N(_ ? E.brain(_) : null, t.pollMs ?? 0), y = v.data, [b, x] = c(e.file ?? (e.id ? U(e.id) : void 0)), [S, w] = c(e.id), [T, D] = c(e.reflect), [O, k] = c(""), [A, j] = c(""), M = y ? y.files.find((e) => e.key === b) ?? (S ? y.files.find((e) => qs(e, S)) : void 0) ?? y.files[0] : void 0, P = y ? sc(y.reflect) : [], ee = T && P.some((e) => e.key === T) ? T : P[0]?.key, F = (e) => {
		let n = {
			repo: _ || void 0,
			file: M?.key ?? b,
			id: S,
			reflect: T,
			...e
		};
		t.replace({
			kind: "brain",
			...n
		});
	}, te = (e) => {
		f(e), w(void 0), D(void 0), x(void 0), t.replace({
			kind: "brain",
			repo: e
		});
	}, I = (e) => {
		x(e), j("");
		let t = S && U(S) === e ? S : void 0;
		w(t), F({
			file: e,
			id: t
		});
	}, L = (e) => {
		let t = y?.files.find((t) => qs(t, e))?.key ?? U(e);
		x(t), w(e), F({
			file: t,
			id: e
		});
	}, R = (e) => t.go({
		kind: "item",
		repo: _,
		key: e,
		from: "brain"
	}), z = l.find((e) => e.id === _)?.kit?.default_branch || (y?.ref && y.ref !== "工作区" ? y.ref.split("@")[0] : "") || "main", B = s(null), V = s(null);
	i(() => {
		if (!S || !y || V.current === S) return;
		let e = Array.from(B.current?.querySelectorAll("[data-entry-id]") ?? []).find((e) => e.dataset.entryId === S);
		e && (V.current = S, e.scrollIntoView?.({
			behavior: r ? "auto" : "smooth",
			block: "center"
		}));
	}, [
		S,
		y,
		M?.key,
		r
	]);
	let ne = o(() => M ? M.sections.map((e) => ({
		title: e.title,
		entries: e.entries.filter((e) => e.id === S || Ys(e, O.trim(), A))
	})).filter((e) => e.entries.length > 0) : [], [
		M,
		S,
		O,
		A
	]), re = M ? Js(M).length : 0, H = ne.reduce((e, t) => e + t.entries.length, 0), ie = !!(S && y && !y.files.some((e) => qs(e, S))), ae = !!y && y.files.every((e) => Js(e).length === 0), W = y ? Xs(y.lint) : [], G = y && /* @__PURE__ */ h(mc, {
		repo: _,
		branch: z,
		items: P,
		pick: ee,
		onPick: (e) => {
			D(e), F({ reflect: e });
		},
		onItem: R,
		onApplied: v.reload,
		post: {
			preview: (e) => n.post(E.reflectPreview(), {
				repo: _,
				key: e
			}),
			apply: (e) => n.post(E.reflectApply(), e)
		}
	}, _);
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view bv-root",
		"data-testid": "br-brain",
		ref: B,
		children: [
			/* @__PURE__ */ h("style", { children: gc }),
			/* @__PURE__ */ g("header", {
				className: "bv-top",
				children: [
					/* @__PURE__ */ h(Y, {
						role: "brain",
						size: 26,
						className: "bv-top-icon"
					}),
					/* @__PURE__ */ g("div", {
						className: "br-view-head",
						children: [/* @__PURE__ */ h("h2", { children: "Brain" }), /* @__PURE__ */ h("p", { children: "仓库里的共享知识：运行加载它，用上了就引用" })]
					}),
					/* @__PURE__ */ h("span", { className: "br-grow" }),
					l.length > 0 && /* @__PURE__ */ g(m, { children: [
						/* @__PURE__ */ g("label", {
							className: "bv-repo",
							htmlFor: "brain-repo",
							children: [/* @__PURE__ */ h("span", {
								className: "br-dim",
								children: "仓库"
							}), /* @__PURE__ */ h("select", {
								id: "brain-repo",
								value: p?.id ?? _,
								onChange: (e) => te(e.target.value),
								children: a.map((e) => /* @__PURE__ */ g("option", {
									value: e.id,
									disabled: !e.ok,
									children: [Jt(e, a), e.ok ? "" : "（现在读不了）"]
								}, e.id))
							})]
						}),
						y?.ref && /* @__PURE__ */ g("span", {
							className: "bv-ref",
							title: `Brain 读的是默认分支上的这个版本：${y.ref}`,
							children: ["读的是 ", /* @__PURE__ */ h("code", { children: y.ref.split("@")[0] })]
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn",
							onClick: v.reload,
							disabled: !_,
							children: [/* @__PURE__ */ h($, {
								name: "RefreshCw",
								size: 14
							}), "重新读取"]
						})
					] })
				]
			}),
			t.status && l.length === 0 && t.status.repos.length > 0 && (t.status.brainkit.ok ? /* @__PURE__ */ h(Vt, {
				testid: "repos-unusable",
				title: "列表里的仓库现在都读不了",
				text: t.status.repos.map((e) => `${e.name}：${e.pending ? e.pending.text : e.error || "读不了"}`),
				punch: "按上面的提示修好以后，这里就能看到它的 Brain。",
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => t.go({ kind: "import" }),
					children: [/* @__PURE__ */ h(Y, {
						role: "import",
						size: 17
					}), "去导入仓库检查"]
				})
			}) : /* @__PURE__ */ h(ec, {
				status: t.status,
				onSettings: () => t.go({ kind: "settings" })
			})),
			t.status && t.status.repos.length === 0 && /* @__PURE__ */ h(Vt, {
				testid: "import-cta",
				label: "导入仓库",
				title: "还没有能用的仓库",
				text: ["Brain 是一个仓库里大家共用的知识：做需求时定下的原则、决定和踩过的坑。每次运行会加载它，用上了就引用。"],
				punch: "先导入一个仓库，这里就能看到它的 Brain。",
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => t.go({ kind: "import" }),
					children: [/* @__PURE__ */ h(Y, {
						role: "import",
						size: 17
					}), "导入仓库"]
				})
			}),
			p && /* @__PURE__ */ h(Vt, {
				testid: "repo-unreadable",
				title: `${p.name} 的 Brain 现在看不了`,
				text: [p.pending ? p.pending.text : p.error || "读不了"],
				punch: "按上面的提示修好以后，这里就能看到它的 Brain；要看别的仓库，在右上角换一个。",
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => t.go({
						kind: "import",
						path: p.path
					}),
					children: [/* @__PURE__ */ h(Y, {
						role: "import",
						size: 17
					}), "去导入仓库检查"]
				})
			}),
			/* @__PURE__ */ h(zt, {
				loading: v.loading,
				error: v.error,
				has: !!y
			}),
			y?.error && /* @__PURE__ */ g("div", {
				className: "br-banner is-error",
				role: "alert",
				children: [y.error, y.raw && /* @__PURE__ */ g("details", {
					className: "br-raw",
					children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", {
						className: "br-mono",
						children: y.raw
					})]
				})]
			}),
			y && ae && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g(Vt, {
					testid: "brain-empty",
					title: "Brain 还是空的",
					text: [y.reflect.length ? "下面「回写」里有做完的需求：把那次运行里 AI 提议的知识（原则、决定、踩过的坑）写进这个仓库的 Brain，写在一个新分支上，开 MR 给大家看过再合并。" : "这个仓库还没有能回写的需求。开一个需求做完、合并以后，在这一页「回写」：把那次运行里 AI 提议的知识（原则、决定、踩过的坑）写进 Brain。"],
					punch: "写进去的条目，下一次运行会加载；用上了就引用，这里都看得到。",
					flow: Qs,
					children: [y.reflect.length > 0 && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-primary is-big",
						onClick: () => B.current?.querySelector("[aria-label=\"回写\"]")?.scrollIntoView?.({
							block: "start",
							behavior: r ? "auto" : "smooth"
						}),
						children: [/* @__PURE__ */ h(Y, {
							role: "brain",
							size: 17
						}), "去回写"]
					}), /* @__PURE__ */ g("button", {
						type: "button",
						className: `br-btn is-big${y.reflect.length ? "" : " is-primary"}`,
						onClick: () => t.go({
							kind: "new",
							repo: _
						}),
						children: [/* @__PURE__ */ h(Y, {
							role: "new",
							size: 17
						}), "去开需求"]
					})]
				}),
				W.length > 0 && /* @__PURE__ */ h(uc, { rows: W }),
				G
			] }),
			y && !ae && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ h(tc, {
					data: y,
					lint: W,
					branch: z,
					onEntry: L
				}),
				/* @__PURE__ */ g("div", {
					className: "bv-main",
					children: [/* @__PURE__ */ g("div", {
						className: "bv-col",
						children: [/* @__PURE__ */ h("div", {
							className: "bv-tabs",
							role: "group",
							"aria-label": "Brain 文件",
							children: y.files.map((e) => /* @__PURE__ */ g("button", {
								type: "button",
								className: `bv-tab is-${e.key}`,
								"aria-pressed": M?.key === e.key,
								onClick: () => I(e.key),
								title: `brain/${e.key}.md`,
								"aria-label": `${zs[e.key] ?? e.key} ${e.count}`,
								children: [
									/* @__PURE__ */ h("b", {
										className: "bv-letter",
										"aria-hidden": "true",
										children: e.letter
									}),
									/* @__PURE__ */ h("span", {
										className: "bv-tab-name",
										children: zs[e.key] ?? e.key
									}),
									/* @__PURE__ */ h("span", {
										className: "bv-tab-n",
										children: e.count
									})
								]
							}, e.key))
						}), M && /* @__PURE__ */ g("section", {
							className: `br-card bv-file is-${M.key}`,
							"aria-label": `${zs[M.key] ?? M.key}知识`,
							children: [
								/* @__PURE__ */ g("header", { children: [
									/* @__PURE__ */ g("h3", { children: [zs[M.key] ?? M.key, "知识"] }),
									/* @__PURE__ */ g("code", {
										className: "br-dim br-small",
										children: [
											"brain/",
											M.key,
											".md"
										]
									}),
									/* @__PURE__ */ h("span", {
										className: "br-tag",
										children: Vs[M.side] ?? M.side
									}),
									/* @__PURE__ */ h("span", { className: "br-grow" }),
									/* @__PURE__ */ g("span", {
										className: "br-dim br-small",
										children: [
											"显示 ",
											H,
											"/",
											re,
											" 条"
										]
									})
								] }),
								/* @__PURE__ */ g("div", {
									className: "bv-filter",
									children: [/* @__PURE__ */ g("label", {
										className: "bv-search",
										htmlFor: "brain-text",
										children: [
											/* @__PURE__ */ h("span", {
												className: "br-sr",
												children: "按文字筛"
											}),
											/* @__PURE__ */ h($, {
												name: "Search",
												size: 14
											}),
											/* @__PURE__ */ h("input", {
												id: "brain-text",
												type: "text",
												placeholder: "按条目号、文字、来源筛",
												value: O,
												onChange: (e) => k(e.target.value)
											})
										]
									}), /* @__PURE__ */ h(cc, {
										file: M,
										type: A,
										onType: j
									})]
								}),
								ie && /* @__PURE__ */ g("p", {
									className: "br-note",
									children: [
										"Brain 里没有 ",
										/* @__PURE__ */ h("span", {
											className: "br-mono",
											children: S
										}),
										"：可能已经撤回、归档，或者写错了。"
									]
								}),
								ne.length === 0 && /* @__PURE__ */ h("p", {
									className: "br-empty",
									children: re ? "没有符合筛选的条目。" : "这个文件还没有条目。"
								}),
								ne.map((e, t) => /* @__PURE__ */ g("div", {
									className: "bv-sec",
									children: [e.title && /* @__PURE__ */ g("h4", { children: [
										e.title,
										" ",
										/* @__PURE__ */ h("span", {
											className: "br-dim",
											children: e.entries.length
										})
									] }), /* @__PURE__ */ h("div", {
										className: "bv-entries",
										children: e.entries.map((e) => /* @__PURE__ */ h(lc, {
											e,
											hl: e.id === S
										}, e.id))
									})]
								}, `${e.title}-${t}`))
							]
						})]
					}), /* @__PURE__ */ g("div", {
						className: "bv-col",
						children: [/* @__PURE__ */ h(uc, { rows: W }), /* @__PURE__ */ h(dc, {
							usage: y.usage,
							onEntry: L
						})]
					})]
				}),
				/* @__PURE__ */ h(fc, {
					runs: y.usage.runs,
					unmerged: y.usage.unmerged ?? [],
					branch: z,
					onEntry: L,
					onItem: R
				}),
				G
			] })
		]
	});
}
function ec({ status: e, onSettings: t }) {
	let n = Kt(e.brainkit.error), r = e.repos.filter((e) => !e.pending && /没装载/.test(e.error)), i = e.repos.filter((e) => !r.includes(e));
	return /* @__PURE__ */ h(Vt, {
		testid: "repos-unusable",
		title: `${n.text}：这里还看不了 Brain`,
		text: [`${r.length === e.repos.length ? "列表里的 " : ""}${r.length} 个仓库的 Brain 都要 brain-kit 才读得出来。`, ...i.map((e) => `${e.name}：${e.pending ? e.pending.text : e.error || "读不了"}`)],
		punch: n.kind === "missing" ? "写对 brain-kit 的位置以后，这里就能看到它们的 Brain。" : "brain-kit 修好以后，这里就能看到它们的 Brain。",
		children: /* @__PURE__ */ g("button", {
			type: "button",
			className: "br-btn is-primary is-big",
			onClick: t,
			children: [/* @__PURE__ */ h(Y, {
				role: "settings",
				size: 17
			}), n.kind === "missing" ? "去填位置" : "去设置"]
		})
	});
}
function tc({ data: e, lint: t, branch: n, onEntry: r }) {
	let i = e.files.reduce((e, t) => e + Js(t).length, 0), a = e.files.flatMap(Js).filter((e) => e.candidate), o = t.filter((e) => e.level === "FAIL").length, s = t.filter((e) => e.level === "WARN").length, c = e.usage;
	return /* @__PURE__ */ g("div", {
		className: "br-kpis bv-kpis",
		role: "group",
		"aria-label": "指标",
		children: [
			/* @__PURE__ */ h(Ht, {
				label: "条目",
				value: i,
				of: "条",
				testid: "kpi-entries",
				children: /* @__PURE__ */ h(nc, {
					files: e.files,
					total: i
				})
			}),
			/* @__PURE__ */ h(rc, {
				label: "知识有用率",
				rate: c.useful,
				hit: "pass",
				cells: "用上的",
				testid: "usage-useful",
				note: `现有条目里被引用过的 · 只算合并进 ${n} 的运行`,
				none: "Brain 里还没有条目：写进条目以后才算得出"
			}),
			/* @__PURE__ */ h(rc, {
				label: "重复纠正率",
				rate: c.repeat_rate,
				hit: "fail",
				cells: "又出现的",
				testid: "usage-repeat",
				note: "同样的纠正又出现的",
				none: "还没有「纠正」类的条目：有了才算得出"
			}),
			/* @__PURE__ */ h(Ht, {
				label: "撤回候选",
				value: a.length,
				of: "条",
				testid: "kpi-candidates",
				note: a.length ? void 0 : `没有 · 已归档 ${c.archived} · 已清除 ${c.purged}`,
				children: a.length > 0 && /* @__PURE__ */ g(m, { children: [
					/* @__PURE__ */ h(ac, {
						ids: a.map((e) => e.id),
						onEntry: r,
						tone: "warn"
					}),
					/* @__PURE__ */ h("div", {
						className: "br-kpi-note",
						children: "加载够多次，从没被引用"
					}),
					/* @__PURE__ */ g("p", {
						className: "bv-do",
						children: [/* @__PURE__ */ h("b", { children: "做什么" }), "看一眼还有没有用：没用了，就在下一个需求里让 AI 提议撤回它，回写以后它就从 Brain 里拿掉；还有用就不用管。"]
					})
				] })
			}),
			/* @__PURE__ */ h(Ht, {
				label: "Brain 检查",
				value: o,
				of: "个错",
				tone: o ? "bad" : s ? void 0 : "ok",
				testid: "kpi-lint",
				note: o || s ? `${s} 个提醒` : "全过",
				children: t.some((e) => e.level !== "OK") && /* @__PURE__ */ h("div", {
					className: "kt-segs bv-cells",
					role: "img",
					"aria-label": `${o} 个错，${s} 个提醒`,
					children: t.filter((e) => e.level !== "OK").map((e, t) => /* @__PURE__ */ h("i", {
						className: e.level === "FAIL" ? "is-fail" : "is-warn",
						title: e.text
					}, t))
				})
			})
		]
	});
}
function nc({ files: e, total: t }) {
	return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("div", {
		className: "bv-stack",
		role: "img",
		"aria-label": e.map((e) => `${zs[e.key] ?? e.key} ${Js(e).length}`).join("，"),
		children: [e.map((e) => {
			let t = Js(e).length;
			return t > 0 ? /* @__PURE__ */ h("i", {
				className: `is-${e.key}`,
				style: { flexGrow: t },
				title: `${zs[e.key] ?? e.key} ${t} 条`
			}, e.key) : null;
		}), t === 0 && /* @__PURE__ */ h("i", { className: "is-none" })]
	}), /* @__PURE__ */ h("div", {
		className: "cto-legend bv-legend",
		children: e.map((e) => /* @__PURE__ */ g("span", { children: [
			/* @__PURE__ */ h("i", {
				className: `cto-sw is-${e.key}`,
				"aria-hidden": "true"
			}),
			zs[e.key] ?? e.key,
			" ",
			/* @__PURE__ */ h("b", { children: Js(e).length })
		] }, e.key))
	})] });
}
function rc({ label: e, rate: t, hit: n, cells: r, note: i, none: a, testid: o }) {
	if (t[1] <= 0) return /* @__PURE__ */ h(Ht, {
		label: e,
		value: /* @__PURE__ */ h("span", {
			className: "bv-word",
			children: "还没有"
		}),
		note: a,
		testid: o
	});
	let s = le(t);
	return /* @__PURE__ */ h(Ht, {
		label: e,
		value: s.pct,
		of: s.frac,
		note: i,
		testid: o,
		children: /* @__PURE__ */ h(ic, {
			rate: t,
			hit: n,
			label: r
		})
	});
}
function ic({ rate: [e, t], hit: n, label: r }) {
	return t <= 40 ? /* @__PURE__ */ h(Ut, {
		label: `${e}/${t} ${r}`,
		cells: Array.from({ length: t }, (t, r) => ({ tone: r < e ? n : "idle" }))
	}) : /* @__PURE__ */ h("div", {
		className: `bv-meter is-${n}`,
		role: "img",
		"aria-label": `${e}/${t} ${r}`,
		children: /* @__PURE__ */ h("i", { style: { width: `${Math.round(e / t * 100)}%` } })
	});
}
function ac({ ids: e, onEntry: t, tone: n = "idle" }) {
	return e.length ? /* @__PURE__ */ h("span", {
		className: "bv-ids",
		children: e.map((e) => /* @__PURE__ */ h("button", {
			type: "button",
			className: `br-chip tone-${n}`,
			title: "在 Brain 里看这一条",
			onClick: () => t(e),
			children: e
		}, e))
	}) : /* @__PURE__ */ h("span", {
		className: "br-dim",
		children: "—"
	});
}
function oc({ source: e }) {
	let t = /^([^\s:]+):(\S.*)$/.exec(e);
	return /* @__PURE__ */ g("p", {
		className: "br-note",
		"data-testid": "reflect-source",
		children: ["读的是 ", t ? /* @__PURE__ */ g(m, { children: [
			t[1],
			" 分支上的 ",
			/* @__PURE__ */ h("span", {
				className: "br-mono",
				children: t[2]
			})
		] }) : /* @__PURE__ */ h("span", {
			className: "br-mono",
			children: e
		})]
	});
}
var sc = (e) => [...e.filter((e) => e.state === "merged"), ...e.filter((e) => e.state !== "merged")];
function cc({ file: e, type: t, onType: n }) {
	let r = Js(e), i = e.types.filter((e) => r.some((t) => t.type === e)), a = Array.from(new Set(r.map((e) => e.type))).filter((e) => !i.includes(e)), o = [...i, ...a];
	return o.length < 2 ? null : /* @__PURE__ */ g("div", {
		className: "bv-types",
		role: "group",
		"aria-label": "按类型筛",
		children: [/* @__PURE__ */ g("button", {
			type: "button",
			className: "bv-type",
			"aria-pressed": t === "",
			onClick: () => n(""),
			children: ["全部 ", /* @__PURE__ */ h("b", { children: r.length })]
		}), o.map((e) => /* @__PURE__ */ g("button", {
			type: "button",
			className: "bv-type",
			"aria-pressed": t === e,
			onClick: () => n(t === e ? "" : e),
			children: [
				Bs[e] ?? e,
				" ",
				/* @__PURE__ */ h("b", { children: r.filter((t) => t.type === e).length })
			]
		}, e))]
	});
}
function lc({ e, hl: t }) {
	let n = e.loaded_by > 0 ? Math.min(1, e.runs / e.loaded_by) : 0;
	return /* @__PURE__ */ g("article", {
		className: `bv-entry${t ? " is-hl" : ""}${e.candidate ? " is-cand" : ""}`,
		"data-entry-id": e.id,
		"aria-current": t ? "true" : void 0,
		"aria-label": e.id,
		children: [
			/* @__PURE__ */ g("div", {
				className: "bv-entry-top",
				children: [
					/* @__PURE__ */ h("b", {
						className: "br-key",
						children: e.id
					}),
					/* @__PURE__ */ h("span", {
						className: "br-chip tone-info",
						children: Bs[e.type] ?? e.type
					}),
					/* @__PURE__ */ h("span", {
						className: "br-tag",
						children: Vs[e.side] ?? e.side
					}),
					e.rel && Us.has(e.rel.split(" ")[0]) && /* @__PURE__ */ h("span", {
						className: "br-tag",
						children: Gs(e.rel)
					}),
					/* @__PURE__ */ h("span", { className: "br-grow" }),
					e.repeats > 0 && /* @__PURE__ */ g("span", {
						className: `br-chip tone-${e.repeats >= 2 ? "bad" : "warn"}`,
						children: [
							"重复 ",
							e.repeats,
							" 次"
						]
					}),
					e.candidate && /* @__PURE__ */ h("span", {
						className: "br-chip tone-warn",
						title: "看一眼还有没有用：没用了，就在下一个需求里让 AI 提议撤回它，回写以后它就从 Brain 里拿掉；还有用就不用管。",
						children: "撤回候选"
					})
				]
			}),
			/* @__PURE__ */ h("p", {
				className: "bv-text",
				children: /* @__PURE__ */ h(Zs, { text: e.text })
			}),
			/* @__PURE__ */ g("div", {
				className: "bv-entry-foot",
				children: [/* @__PURE__ */ g("span", {
					className: "bv-use",
					title: `合并的运行里，${e.loaded_by} 次加载了它，其中 ${e.runs} 次引用了它（共引用 ${e.cites} 处）`,
					children: [/* @__PURE__ */ h("span", {
						className: `bv-meter is-pass${e.candidate ? " is-cand" : ""}`,
						"aria-hidden": "true",
						children: /* @__PURE__ */ h("i", { style: { width: `${Math.round(n * 100)}%` } })
					}), /* @__PURE__ */ g("span", { children: [e.loaded_by ? /* @__PURE__ */ g(m, { children: [
						e.loaded_by,
						" 次加载 · ",
						/* @__PURE__ */ h("b", { children: e.runs }),
						" 次用上"
					] }) : "合并的运行还没加载过", e.cites > e.runs ? `（引用 ${e.cites} 处）` : ""] })]
				}), e.src.length > 0 && /* @__PURE__ */ g("span", {
					className: "bv-src",
					children: [/* @__PURE__ */ h("span", {
						className: "br-dim",
						children: "来源"
					}), e.src.map((e) => /* @__PURE__ */ h("span", {
						className: "br-tag br-mono",
						children: e
					}, e))]
				})]
			})
		]
	});
}
function uc({ rows: e }) {
	let t = e.filter((e) => e.level === "FAIL").length, n = e.filter((e) => e.level === "WARN").length;
	return /* @__PURE__ */ g("section", {
		className: `br-card${t ? " is-bad" : e.length ? "" : " is-ok"}`,
		"aria-label": "检查",
		"data-testid": "lint",
		children: [/* @__PURE__ */ g("header", { children: [
			/* @__PURE__ */ h(Y, {
				role: "lint",
				size: 18
			}),
			/* @__PURE__ */ h("h3", { children: "Brain 检查" }),
			/* @__PURE__ */ h("span", {
				className: "br-dim br-small",
				children: "默认分支上的条目写得对不对"
			}),
			/* @__PURE__ */ h("span", { className: "br-grow" }),
			t > 0 && /* @__PURE__ */ g("span", {
				className: "br-chip tone-bad",
				children: [t, " 个错"]
			}),
			n > 0 && /* @__PURE__ */ g("span", {
				className: "br-chip tone-warn",
				children: [n, " 个提醒"]
			})
		] }), /* @__PURE__ */ h(xt, { rows: e.length ? e : [{
			level: "OK",
			text: "全过：没有问题"
		}] })]
	});
}
function dc({ usage: e, onEntry: t }) {
	return /* @__PURE__ */ g("section", {
		className: "br-card",
		"aria-label": "用处",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "list",
					size: 18
				}),
				/* @__PURE__ */ h("h3", { children: "用处" }),
				/* @__PURE__ */ h("span", { className: "br-grow" }),
				/* @__PURE__ */ g("span", {
					className: "br-dim br-small",
					children: [
						"已归档 ",
						e.archived,
						" · 已清除 ",
						e.purged
					]
				})
			] }),
			/* @__PURE__ */ g("div", {
				className: "bv-block",
				children: [/* @__PURE__ */ h("b", {
					className: "bv-block-h",
					children: "又出现的条目"
				}), e.repeats_any.length === 0 ? /* @__PURE__ */ h("p", {
					className: "br-empty",
					children: "没有：还没有哪一条又出现过。"
				}) : /* @__PURE__ */ h("ul", {
					className: "bv-repeats",
					"data-testid": "usage-repeats",
					children: e.repeats_any.map(([e, n]) => /* @__PURE__ */ g("li", { children: [
						/* @__PURE__ */ h("button", {
							type: "button",
							className: `br-chip tone-${n >= 2 ? "bad" : "warn"}`,
							onClick: () => t(e),
							children: e
						}),
						/* @__PURE__ */ h("span", {
							className: "bv-rep-n",
							"aria-hidden": "true",
							children: Array.from({ length: Math.min(n, 8) }, (e, t) => /* @__PURE__ */ h("i", {}, t))
						}),
						/* @__PURE__ */ g("span", { children: [
							"重复 ",
							n,
							" 次"
						] }),
						n >= 2 && /* @__PURE__ */ h("span", {
							className: "br-chip tone-bad kt-pill",
							title: "同样的事出现两次以上：写成一个会失败的确定性检查，别再靠 AI 记住",
							children: "该写成确定性检查了"
						})
					] }, e))
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "bv-block",
				children: [/* @__PURE__ */ h("b", {
					className: "bv-block-h",
					children: "从没被引用"
				}), /* @__PURE__ */ h(ac, {
					ids: e.never_cited,
					onEntry: t
				})]
			})
		]
	});
}
function fc({ runs: e, unmerged: t, branch: n, onEntry: r, onItem: i }) {
	return /* @__PURE__ */ g("section", {
		className: "br-card",
		"aria-label": "每次运行的用处",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "laptop",
					size: 18
				}),
				/* @__PURE__ */ h("h3", { children: "每次运行" }),
				/* @__PURE__ */ g("span", {
					className: "br-dim br-small",
					children: [
						"加载了几条，用上了哪些 · 上面的数只算合并进 ",
						n,
						" 的运行"
					]
				})
			] }),
			e.length === 0 ? /* @__PURE__ */ g("p", {
				className: "br-empty",
				children: [
					"合并进 ",
					n,
					" 的运行还没有记下用了 Brain 的哪些条目。"
				]
			}) : /* @__PURE__ */ h("div", {
				className: "br-scroll",
				children: /* @__PURE__ */ g("table", {
					className: "cto-table bv-runs",
					"aria-label": "每次运行",
					children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
						/* @__PURE__ */ h("th", { children: "需求" }),
						/* @__PURE__ */ h("th", { children: "加载 · 用上" }),
						/* @__PURE__ */ h("th", { children: "引用" }),
						/* @__PURE__ */ h("th", { children: "过时" }),
						/* @__PURE__ */ h("th", { children: "不认识" })
					] }) }), /* @__PURE__ */ h("tbody", { children: e.map((e) => {
						let t = e.loaded ? Math.min(1, e.cited.length / e.loaded) : 0;
						return /* @__PURE__ */ g("tr", { children: [
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h("button", {
								type: "button",
								className: "br-link br-key",
								onClick: () => i(e.key),
								children: e.key
							}) }),
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ g("span", {
								className: "bv-load",
								children: [/* @__PURE__ */ h("span", {
									className: "bv-meter is-pass",
									"aria-hidden": "true",
									children: /* @__PURE__ */ h("i", { style: { width: `${Math.round(t * 100)}%` } })
								}), /* @__PURE__ */ g("span", {
									className: "br-mono",
									children: [
										e.loaded ?? "—",
										" · ",
										e.cited.length
									]
								})]
							}) }),
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(ac, {
								ids: e.cited,
								onEntry: r,
								tone: "ok"
							}) }),
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(ac, {
								ids: e.stale,
								onEntry: r,
								tone: "warn"
							}) }),
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(ac, {
								ids: e.unknown,
								onEntry: r,
								tone: "bad"
							}) })
						] }, `${e.key}-${e.intent}`);
					}) })]
				})
			}),
			t.length > 0 && /* @__PURE__ */ g("div", {
				className: "bv-block",
				"data-testid": "usage-unmerged",
				children: [/* @__PURE__ */ h("b", {
					className: "bv-block-h",
					children: "还没合并的（合并以后才算进上面的数）"
				}), /* @__PURE__ */ h("ul", {
					className: "bv-unmerged",
					children: t.map((e) => /* @__PURE__ */ g("li", { children: [
						/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => i(e.key),
							children: e.key
						}),
						/* @__PURE__ */ g("span", { children: [
							e.where === "worktree" ? "还在本机做" : "还在分支上",
							"：加载 ",
							e.loaded ?? "—",
							" · 引用 ",
							e.cited.length
						] }),
						/* @__PURE__ */ h(ac, {
							ids: e.cited,
							onEntry: r,
							tone: "ok"
						})
					] }, e.key))
				})]
			})
		]
	});
}
function pc(e) {
	if (e.error || e.problems.length) return {
		what: "blocked",
		text: ""
	};
	let t = e.gaps.length ? "下面「Brain 里缺的」是这次发现还缺的知识或测试，可以开成新的需求。" : "";
	return e.ops.length === 0 && e.notes.length === 0 ? {
		what: "nothing",
		text: `这次运行没有给 Brain 的提议：不用回写。${t}`
	} : e.ops.length === 0 ? {
		what: "nothing",
		text: `这次的提议 Brain 里都有了（或者已经在别的回写分支上）：不用回写。${t}`
	} : e.substantive ? {
		what: "write",
		text: ""
	} : {
		what: "nothing",
		text: `这次的提议只是给已有的 ${Array.from(new Set(e.ops.map((e) => e.target).filter((e) => !!e))).join("、") || "条目"} 补来源，没有新知识：不开分支，Brain 不变，不用回写。${t}`
	};
}
function mc({ repo: e, branch: t, items: n, pick: r, onPick: i, onItem: a, onApplied: o, post: s }) {
	let l = P(s.preview), u = P(s.apply), [d, f] = c(null), p = l.result && l.result.key === r ? l.result : null, m = p ? pc(p) : null, _ = !!u.result?.ok, v = !m || m.what !== "write" || _, y = async (t) => {
		if (!r) return;
		let n = await u.run({
			repo: e,
			key: r,
			push: t
		});
		f(null), n && o();
	}, b = [
		["选一个需求", r ? "done" : n.length ? "now" : void 0],
		["预览", p ? "done" : r ? "now" : void 0],
		["确认写入", _ ? "done" : m ? m.what === "nothing" ? "off" : m.what === "blocked" ? "bad" : "now" : void 0],
		["写在新分支上", _ ? "done" : u.result ? "bad" : m?.what === "nothing" ? "off" : void 0]
	], x = n.find((e) => e.key === r), S = u.result;
	return /* @__PURE__ */ g("section", {
		className: `br-card bv-reflect${_ ? " is-ok" : ""}`,
		"aria-label": "回写",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "brain",
					size: 20
				}),
				/* @__PURE__ */ h("h3", { children: "回写" }),
				/* @__PURE__ */ h("span", {
					className: "br-dim br-small",
					children: "把一次运行里 AI 提议的知识写进 Brain：先预览，再写进新分支（可以开 MR）"
				})
			] }),
			/* @__PURE__ */ h("ol", {
				className: `bv-steps${n.length ? "" : " is-idle"}`,
				"aria-label": "回写的步骤",
				children: b.map(([e, t], n) => /* @__PURE__ */ g("li", {
					className: t ? `is-${t}` : void 0,
					"data-state": t,
					children: [/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: t === "done" ? "✓" : t === "bad" ? "✕" : t === "off" ? "–" : n + 1
					}), /* @__PURE__ */ h("span", { children: e })]
				}, e))
			}),
			n.length === 0 ? /* @__PURE__ */ h("p", {
				className: "br-empty",
				children: "还没有能回写的需求：一个需求的运行提出了新知识，它就会出现在这里（通常在合并以后回写）。"
			}) : /* @__PURE__ */ g("div", {
				className: "bv-pick",
				children: [
					/* @__PURE__ */ h("label", {
						className: "br-sr",
						htmlFor: "reflect-key",
						children: "选一个需求"
					}),
					/* @__PURE__ */ h("select", {
						id: "reflect-key",
						value: r ?? "",
						onChange: (e) => {
							i(e.target.value), l.reset(), u.reset(), f(null);
						},
						children: n.map((e) => /* @__PURE__ */ g("option", {
							value: e.key,
							children: [
								e.key,
								" · ",
								e.title,
								"（",
								e.state === "merged" ? "已合并" : "还没合并",
								"）"
							]
						}, e.key))
					}),
					x && /* @__PURE__ */ h(et, { state: x.state }),
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: !r || l.busy,
						onClick: () => {
							u.reset(), f(null), r && l.run(r);
						},
						children: [/* @__PURE__ */ h($, {
							name: "Eye",
							size: 14
						}), l.busy ? "正在预览…" : p ? "再预览一次" : "预览"]
					}),
					r && /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-link",
						onClick: () => a(r),
						children: Z.openDetail
					}),
					x && x.state !== "merged" && /* @__PURE__ */ h("span", {
						className: "br-hint",
						children: "还没合并：一般合并以后再回写。现在写也行，读的是它还在做的那一份。"
					})
				]
			}),
			l.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			}),
			p && m && /* @__PURE__ */ g("div", {
				className: "bv-preview",
				"data-testid": "reflect-preview",
				children: [
					p.source && /* @__PURE__ */ h(oc, { source: p.source }),
					p.error && /* @__PURE__ */ h("p", {
						className: "br-error br-pre",
						role: "alert",
						children: p.error
					}),
					p.problems.length > 0 && /* @__PURE__ */ h("div", {
						"data-testid": "reflect-problems",
						children: /* @__PURE__ */ h(xt, { rows: p.problems })
					}),
					m.what === "write" && /* @__PURE__ */ h("div", {
						className: "br-scroll",
						children: /* @__PURE__ */ g("table", {
							className: "cto-table bv-ops",
							"aria-label": "要写的改动",
							children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
								/* @__PURE__ */ h("th", { children: "动作" }),
								/* @__PURE__ */ h("th", { children: "条目" }),
								/* @__PURE__ */ h("th", { children: "写到" }),
								/* @__PURE__ */ h("th", { children: "类型" }),
								/* @__PURE__ */ h("th", { children: "来源" }),
								/* @__PURE__ */ h("th", { children: "文字" })
							] }) }), /* @__PURE__ */ h("tbody", { children: p.ops.map((e, t) => /* @__PURE__ */ g("tr", { children: [
								/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h("span", {
									className: `br-chip tone-${Ks(e.kind)}`,
									children: Gs(e.kind)
								}) }),
								/* @__PURE__ */ h("td", {
									className: "br-mono",
									children: e.target ?? /* @__PURE__ */ h("span", {
										className: "br-dim",
										children: "新条目"
									})
								}),
								/* @__PURE__ */ g("td", { children: [e.file ? /* @__PURE__ */ h("span", {
									className: `bv-filetag is-${e.file}`,
									children: zs[e.file] ?? e.file
								}) : /* @__PURE__ */ h("span", {
									className: "br-dim",
									children: "—"
								}), e.section && /* @__PURE__ */ g("span", {
									className: "br-dim",
									children: [" · ", e.section]
								})] }),
								/* @__PURE__ */ h("td", { children: e.type ? /* @__PURE__ */ h("span", {
									className: "br-chip tone-info",
									children: Bs[e.type] ?? e.type
								}) : /* @__PURE__ */ h("span", {
									className: "br-dim",
									children: "—"
								}) }),
								/* @__PURE__ */ h("td", { children: e.src.length ? /* @__PURE__ */ h("span", {
									className: "bv-src",
									children: e.src.map((e) => /* @__PURE__ */ h("span", {
										className: "br-tag br-mono",
										children: e
									}, e))
								}) : "—" }),
								/* @__PURE__ */ h("td", {
									className: "br-pre",
									children: e.text ? /* @__PURE__ */ h(Zs, { text: e.text }) : /* @__PURE__ */ h("span", {
										className: "br-dim",
										children: "—"
									})
								})
							] }, t)) })]
						})
					}),
					m.text && /* @__PURE__ */ h("p", {
						className: "br-banner is-info",
						role: "status",
						"data-testid": "reflect-nothing",
						children: m.text
					}),
					p.gaps.length > 0 && /* @__PURE__ */ g("div", {
						className: "bv-block",
						children: [/* @__PURE__ */ h("b", {
							className: "bv-block-h",
							children: "Brain 里缺的"
						}), /* @__PURE__ */ h("ul", {
							className: "bv-gaps",
							children: p.gaps.map((e, t) => /* @__PURE__ */ g("li", { children: [
								/* @__PURE__ */ h("b", { children: e.title }),
								/* @__PURE__ */ h("span", {
									className: "br-tag",
									children: Xe[e.kind] ?? "其他"
								}),
								/* @__PURE__ */ h("span", { children: e.what })
							] }, t))
						})]
					}),
					p.warnings.length > 0 && /* @__PURE__ */ h(xt, { rows: p.warnings.map((e) => ({
						level: "WARN",
						text: e
					})) }),
					p.notes.length > 0 && /* @__PURE__ */ h("ul", {
						className: "br-list br-dim br-small",
						children: p.notes.map((e, t) => /* @__PURE__ */ h("li", { children: e }, t))
					}),
					(p.raw?.length ?? 0) > 0 && /* @__PURE__ */ g("details", {
						className: "br-raw",
						children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: p.raw.join("\n") })]
					}),
					m.what !== "nothing" && /* @__PURE__ */ g("div", {
						className: "br-row",
						children: [
							/* @__PURE__ */ g("button", {
								type: "button",
								className: "br-btn",
								disabled: v || u.busy,
								"aria-pressed": d === !1,
								onClick: () => f(!1),
								children: [/* @__PURE__ */ h($, {
									name: "GitBranch",
									size: 14
								}), "写入新分支"]
							}),
							/* @__PURE__ */ g("button", {
								type: "button",
								className: "br-btn",
								disabled: v || u.busy,
								"aria-pressed": d === !0,
								onClick: () => f(!0),
								children: [/* @__PURE__ */ h($, {
									name: "GitPullRequest",
									size: 14
								}), "写入并开 MR"]
							}),
							_ && /* @__PURE__ */ h("span", {
								className: "br-hint",
								children: "已经写好了：要再写一次，先重新预览。"
							}),
							m.what === "blocked" && /* @__PURE__ */ h("span", {
								className: "br-hint",
								children: "上面的问题改好以后，重新预览再写。"
							})
						]
					}),
					d !== null && !v && /* @__PURE__ */ g("div", {
						className: "br-confirm",
						role: "group",
						"aria-label": "确认写入",
						children: [/* @__PURE__ */ h("p", {
							className: "br-pre",
							children: d ? `从 ${t} 开一个新分支，写入 ${r} 的 ${p.ops.length} 处改动，推到远端并开 MR。你现在的工作目录不动。` : `从 ${t} 开一个新分支，写入 ${r} 的 ${p.ops.length} 处改动，只在本机，不推。你现在的工作目录不动。`
						}), /* @__PURE__ */ g("div", {
							className: "br-row",
							children: [/* @__PURE__ */ h("button", {
								type: "button",
								className: "br-btn is-primary",
								disabled: u.busy,
								onClick: () => void y(d),
								children: u.busy ? "正在写…" : "确定写入"
							}), /* @__PURE__ */ h("button", {
								type: "button",
								className: "br-btn",
								disabled: u.busy,
								onClick: () => f(null),
								children: "取消"
							})]
						})]
					})
				]
			}),
			u.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: u.error
			}),
			S && /* @__PURE__ */ g("div", {
				className: `br-banner ${S.ok ? "is-ok" : "is-error"} bv-applied`,
				"data-testid": "reflect-applied",
				children: [
					/* @__PURE__ */ h("p", {
						className: S.ok ? "br-strong" : "br-error",
						role: "status",
						children: S.ok ? `写好了${S.branch ? `：分支 ${S.branch}` : ""}` : "没写成：原因在「细节」里。改好以后重新预览，再写一次。"
					}),
					S.ok && S.mr_url && /* @__PURE__ */ g("p", {
						className: "br-row",
						children: [/* @__PURE__ */ h(dt, {
							href: S.mr_url,
							className: "br-btn is-small is-primary",
							children: Z.viewMr
						}), /* @__PURE__ */ g("span", { children: [
							"MR 合并进 ",
							t,
							" 以后，这里的条目就更新了。"
						] })]
					}),
					S.ok && !S.mr_url && S.pushed && /* @__PURE__ */ h("p", { children: "推上去了，但没开成 MR（这台机器没有 GitLab 的令牌）：在 GitLab 上用这个分支开一个 MR，合并以后这里就更新了。" }),
					S.ok && !S.pushed && /* @__PURE__ */ g("p", { children: [
						"只写在本机，还没推。要给团队看：把这个分支推上去再开 MR（怎么推在「细节」里）；合并进 ",
						t,
						" 以后这里就更新了。"
					] }),
					S.worktree && /* @__PURE__ */ g("p", {
						className: "br-note",
						"data-testid": "reflect-worktree",
						children: ["工作区：", /* @__PURE__ */ h("span", {
							className: "br-mono",
							children: S.worktree
						})]
					}),
					S.output && /* @__PURE__ */ g("details", {
						className: "br-raw",
						children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", {
							className: "br-findings",
							children: S.output
						})]
					})
				]
			})
		]
	});
}
var hc = (e, t, n, r) => `--bv-PRODUCT: ${e}; --bv-TECH: ${t}; --bv-IMPROVEMENT: ${n}; --bv-PROJECT: ${r};`, gc = `
.bv-root { ${hc("#3987e5", "#9085e9", "#d95926", "#3ea37a")} }
:root[data-mode="light"] .bv-root { ${hc("#2a78d6", "#6250d6", "#eb6834", "#1f8a5c")} }
.bv-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }
.bv-top-icon { color: var(--accent); }
.bv-top .br-view-head p { font-size: .93em; }
.bv-repo { display: inline-flex; align-items: center; gap: .5em; font-size: .93em; }
.bv-repo select { padding: .35em .7em; border-radius: .7em; }
.bv-ref { font-size: .86em; color: var(--muted); padding: .2em .7em; border-radius: 999px; background: var(--kt-glass); border: 1px solid var(--border); }
.bv-ref code { color: var(--text-strong); }
/* five cards: one row; three over two (a grid of six, so each row is full); two by two, the last one as wide as two */
.bv-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }
@container kt-root (max-width: 1200px) { .bv-kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); } .bv-kpis > * { grid-column: span 2; } .bv-kpis > :nth-child(n+4) { grid-column: span 3; } }
@container kt-root (max-width: 760px) { .bv-kpis > *, .bv-kpis > :nth-child(n+4) { grid-column: span 3; } .bv-kpis > :last-child:nth-child(odd) { grid-column: span 6; } }
@container kt-root (max-width: 460px) { .bv-kpis > *, .bv-kpis > :nth-child(n+4), .bv-kpis > :last-child:nth-child(odd) { grid-column: span 6; } }
.bv-kpis .br-kpi-big { font-size: 2.6em; }
.bv-kpis .bv-word { font-size: .73em; color: var(--muted); }
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
@container kt-root (max-width: 1200px) { .bv-main { grid-template-columns: minmax(0, 1fr); } }
.bv-col { display: grid; gap: var(--kit-gap-row, 12px); min-width: 0; align-content: start; }
.bv-tabs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .6em; }
@container kt-root (max-width: 700px) { .bv-tabs { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.bv-tab { appearance: none; font: inherit; display: grid; grid-template-columns: 2.3em minmax(0, 1fr) auto; align-items: center; gap: .7em; padding: .6em .9em;
  border-radius: 12px; border: 1px solid var(--border); background: var(--card); color: var(--text); cursor: pointer; text-align: left; }
.bv-tab:hover { border-color: var(--border-strong); }
.bv-tab[aria-pressed="true"] { border-color: var(--bv-c, var(--accent)); background: color-mix(in srgb, var(--bv-c, var(--accent)) 12%, var(--card));
  box-shadow: 0 0 0 1px var(--bv-c, var(--accent)); }
.bv-letter { display: grid; place-items: center; width: 2.3em; height: 2.3em; border-radius: .6em; font-weight: 850; color: #fff; background: var(--bv-c, var(--muted)); }
.bv-tab-name { font-weight: 750; font-size: 1.05em; color: var(--text-strong); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
.bv-code { font-family: var(--mono, ui-monospace, monospace); font-size: .88em; padding: .05em .35em; border-radius: 5px;
  background: color-mix(in srgb, var(--muted) 16%, transparent); border: 1px solid color-mix(in srgb, var(--muted) 22%, transparent); }
.bv-do { margin: .2em 0 0; font-size: .84em; line-height: 1.5; color: var(--text); }
.bv-do b { color: var(--muted); font-weight: 650; margin-right: .4em; }
.bv-unmerged { list-style: none; margin: 0; padding: 0; display: grid; gap: .4em; }
.bv-unmerged li { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; padding: .45em .7em; border-radius: var(--kit-r-cell, 10px);
  border: 1px dashed var(--border-strong, var(--border)); }
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
@container kt-root (max-width: 760px) { .bv-steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
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
.bv-steps.is-idle { opacity: .55; }
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
.bv-applied a.br-btn { text-decoration: none; }
.bv-applied a.br-btn.is-primary { color: var(--accent-fg, #fff); }
`, _c = (e) => Math.round(e).toLocaleString("zh-CN"), vc = (e) => e.slice(5), yc = (e) => vc(e).replace(/^0/, "").replace("-0", "-").replace("-", "/"), bc = [
	"unattended",
	"people",
	"local",
	"pending"
], xc = {
	unattended: "无人值守",
	people: "有人插手",
	local: "只在本机",
	pending: "还没评",
	ended: "没交付就结束"
}, Sc = {
	unattended: "var(--s4)",
	people: "var(--s2)",
	local: "var(--s1)",
	pending: "var(--s3)",
	ended: "var(--kt-bad)"
};
function Cc(e = 600) {
	let t = s(null), [n, r] = c(e);
	return i(() => {
		let e = t.current;
		if (!e) return;
		let n = () => e.clientWidth > 0 && r(e.clientWidth);
		if (n(), typeof ResizeObserver > "u") return;
		let i = new ResizeObserver(n);
		return i.observe(e), () => i.disconnect();
	}, []), [t, n];
}
function wc({ tip: e, width: t }) {
	let n = s(null), [r, a] = c(0);
	return i(() => {
		if (!e || !n.current) return;
		let r = n.current.offsetWidth || 200, i = e.side === "right" ? e.x : e.side === "left" ? e.x - r : e.x - r / 2;
		a(Math.min(Math.max(i, 0), Math.max(0, t - r)));
	}, [e, t]), e ? /* @__PURE__ */ g("div", {
		ref: n,
		className: "cto-tip",
		role: "tooltip",
		style: {
			left: r,
			top: e.y
		},
		children: [e.when && /* @__PURE__ */ h("div", {
			className: "cto-when",
			children: e.when
		}), e.rows.map(([e, t, n], r) => /* @__PURE__ */ g("div", {
			className: "cto-row",
			children: [
				/* @__PURE__ */ h("b", { children: e }),
				n && /* @__PURE__ */ h("i", {
					className: "cto-key",
					style: { background: n }
				}),
				/* @__PURE__ */ h("span", { children: t })
			]
		}, r))]
	}) : null;
}
function Tc({ x: e, y: t, w: n, h: r, rows: i, onTip: a, when: o, tipY: s, tipX: c, side: l, onPick: u, label: d }) {
	let f = () => a({
		x: c ?? e + n / 2,
		y: s ?? t + r + 6,
		rows: i,
		when: o,
		side: l
	});
	return /* @__PURE__ */ h("rect", {
		className: `cto-hit${u ? " is-pick" : ""}`,
		x: e,
		y: t,
		width: n,
		height: r,
		rx: 6,
		tabIndex: 0,
		role: u ? "button" : void 0,
		"aria-label": d,
		onPointerEnter: f,
		onFocus: f,
		onPointerLeave: () => a(null),
		onBlur: () => a(null),
		onClick: u,
		onKeyDown: u ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), u()) : void 0
	});
}
function Ec({ x: e, y: t, w: n, h: r, fill: i }) {
	let a = Math.min(4, n, r / 2);
	return /* @__PURE__ */ h("path", {
		d: `M${e},${t} H${e + n - a} Q${e + n},${t} ${e + n},${t + a} V${t + r - a} Q${e + n},${t + r} ${e + n - a},${t + r} H${e} Z`,
		fill: i
	});
}
function Dc({ label: e, height: t, children: n }) {
	let [r, i] = Cc(360), [a, o] = c(null);
	return /* @__PURE__ */ g("div", {
		className: "cto-mini",
		ref: r,
		children: [/* @__PURE__ */ h("svg", {
			viewBox: `0 0 ${i} ${t}`,
			height: t,
			role: "img",
			"aria-label": e,
			children: n(i, o)
		}), /* @__PURE__ */ h(wc, {
			tip: a,
			width: i
		})]
	});
}
function Oc({ y0: e, bh: t, L: n, pw: r, max: i, segs: a, total: o, label: s, strong: c, onTip: l, tipLabel: u }) {
	let d = 0, f = a.filter((e) => e.n > 0), p = f.map((a, o) => {
		let s = n + d / i * r + (d > 0 ? 2 : 0), c = n + (d + a.n) / i * r;
		return d += a.n, c - s <= .5 ? null : o === f.length - 1 ? /* @__PURE__ */ h(Ec, {
			x: s,
			y: e,
			w: c - s,
			h: t,
			fill: a.fill
		}, a.key) : /* @__PURE__ */ h("rect", {
			x: s,
			y: e,
			width: c - s,
			height: t,
			fill: a.fill
		}, a.key);
	}), m = n + d / i * r;
	return /* @__PURE__ */ g("g", { children: [
		/* @__PURE__ */ h("text", {
			x: 0,
			y: e + t / 2 + 4,
			className: c ? "is-strong" : void 0,
			children: s
		}),
		p,
		d === 0 && /* @__PURE__ */ h("rect", {
			x: n,
			y: e,
			width: r,
			height: t,
			rx: 4,
			fill: "var(--cto-glass)"
		}),
		/* @__PURE__ */ h("text", {
			x: m + 8,
			y: e + t / 2 + 4,
			className: c ? "is-strong" : void 0,
			children: o
		}),
		/* @__PURE__ */ h(Tc, {
			x: n - 4,
			y: e - 3,
			w: Math.max(m - n, r * .3) + 8,
			h: t + 6,
			onTip: l,
			rows: [[o, u], ...a.map((e) => [
				_c(e.n),
				e.name,
				e.fill
			])]
		})
	] });
}
function kc({ c: e }) {
	let t = (t) => e.runs.filter((e) => e.how === t).length, n = [...bc, ...t("ended") ? ["ended"] : []].map((e) => ({
		key: e,
		n: t(e),
		fill: Sc[e],
		name: xc[e]
	})), r = n.reduce((e, t) => e + t.n, 0);
	return /* @__PURE__ */ h(Dc, {
		label: `评估过的需求，按交付方式：${n.map((e) => `${e.name} ${e.n}`).join("，")}`,
		height: 28,
		children: (e, t) => /* @__PURE__ */ h(Oc, {
			y0: 2,
			bh: 22,
			L: 0,
			pw: Math.max(10, e - 50),
			max: Math.max(1, r),
			segs: n,
			total: `${r} 个`,
			label: "",
			onTip: t,
			tipLabel: "评估过的需求"
		})
	});
}
function Ac({ c: e }) {
	let t = e.stepped_in, n = t?.at_points ?? 0, r = t?.outside ?? 0, i = t?.kinds ?? [], a = [[
		"判断点上",
		n,
		"var(--ov-person)",
		!0
	], [
		"判断点外",
		r,
		"var(--vs-rework)",
		!1
	]], o = Math.max(1, n, r);
	return /* @__PURE__ */ h(Dc, {
		label: `人介入：判断点上 ${n} 次，判断点之外 ${r} 次`,
		height: 62,
		children: (e, t) => {
			let n = Math.max(10, e - 64 - 48);
			return a.map(([e, r, a, s], c) => {
				let l = 2 + c * 36, u = r / o * n, d = i.filter((e) => e.point === s);
				return /* @__PURE__ */ g("g", { children: [
					/* @__PURE__ */ h("text", {
						x: 0,
						y: l + 11 + 4,
						className: c === 0 ? "is-strong" : void 0,
						children: e
					}),
					r > 0 ? /* @__PURE__ */ h(Ec, {
						x: 64,
						y: l,
						w: Math.max(u, 1),
						h: 22,
						fill: a
					}) : /* @__PURE__ */ h("rect", {
						x: 64,
						y: l,
						width: n,
						height: 22,
						rx: 4,
						fill: "var(--cto-glass)"
					}),
					/* @__PURE__ */ g("text", {
						x: 64 + (r > 0 ? u : 0) + 8,
						y: l + 11 + 4,
						className: c === 0 ? "is-strong" : void 0,
						children: [_c(r), " 次"]
					}),
					/* @__PURE__ */ h(Tc, {
						x: 60,
						y: l - 3,
						w: Math.max(u, n * .3) + 8,
						h: 28,
						onTip: t,
						rows: [[_c(r), s ? "判断点上（批准、退回、回答）" : "判断点之外"], ...d.map((e) => [_c(e.n), e.label])]
					})
				] }, e);
			});
		}
	});
}
function jc({ rows: e, avg: t, onKey: n }) {
	let r = e.slice().sort((e, t) => t.credits - e.credits).slice(0, 6), i = e.length - r.length, a = t === null ? 3 : 16, o = a + Math.max(1, r.length) * 14 + (i > 0 ? 16 : 3), s = Math.max(1, ...r.map((e) => e.credits), t ?? 0);
	return /* @__PURE__ */ h(Dc, {
		label: `credits：${r.map((e) => `${e.key} ${e.credits}`).join("，")}${t === null ? "" : `；平均 ${t}`}${i > 0 ? `；还有 ${i} 个` : ""}`,
		height: o,
		children: (e, c) => {
			let l = Math.max(10, e - 64 - 46), u = t === null ? null : 64 + t / s * l;
			return /* @__PURE__ */ g(m, { children: [
				u !== null && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("line", {
					x1: u,
					x2: u,
					y1: a - 4,
					y2: a + r.length * 14,
					stroke: "var(--text-strong)",
					strokeWidth: 1,
					strokeDasharray: "3 3"
				}), /* @__PURE__ */ g("text", {
					x: u,
					y: a - 6,
					textAnchor: u > e - 60 ? "end" : u < 104 ? "start" : "middle",
					style: { fontSize: 11 },
					children: ["平均 ", t]
				})] }),
				r.map((e, t) => {
					let r = a + t * 14, i = e.credits / s * l, o = e.credits.toFixed(1), d = 64 + i + 6;
					return u !== null && d < u + 4 && d + o.length * 6.5 > u - 3 && (d = u + 5), /* @__PURE__ */ g("g", { children: [
						/* @__PURE__ */ h("text", {
							x: 0,
							y: r + 9 - .5,
							style: { fontSize: 11 },
							className: t === 0 ? "is-strong" : void 0,
							children: e.key
						}),
						/* @__PURE__ */ h(Ec, {
							x: 64,
							y: r,
							w: Math.max(i, 1),
							h: 9,
							fill: "var(--ov-ink)"
						}),
						/* @__PURE__ */ h("text", {
							x: d,
							y: r + 9 - .5,
							style: { fontSize: 11 },
							children: o
						}),
						/* @__PURE__ */ h(Tc, {
							x: 60,
							y: r - 2,
							w: Math.max(i, 30) + 8,
							h: 13,
							onTip: c,
							rows: [[o, `${e.key} 的 credits`], ...n ? [["点击", "看它的看板"]] : []],
							onPick: n ? () => n(e.key) : void 0,
							label: `${e.key}：${e.credits} credits`
						})
					] }, e.key);
				}),
				i > 0 && /* @__PURE__ */ g("text", {
					x: 64,
					y: o - 3,
					style: { fontSize: 11 },
					children: [
						"还有 ",
						i,
						" 个没画出来（credits 少一些）"
					]
				})
			] });
		}
	});
}
function Mc({ rows: e }) {
	let t = e.reduce((e, t) => e + t.count, 0);
	return /* @__PURE__ */ h(Dc, {
		label: `决定：${e.map((e) => `${e.label} ${e.count}`).join("，")}`,
		height: 28,
		children: (n, r) => /* @__PURE__ */ h(Oc, {
			y0: 2,
			bh: 22,
			L: 0,
			pw: Math.max(10, n - 0 - 50),
			max: Math.max(1, t),
			total: `${t} 个`,
			label: "",
			segs: e.map((e) => ({
				key: e.id,
				n: e.count,
				fill: Nc[e.id] ?? "var(--ov-ink-3)",
				name: e.label
			})),
			onTip: r,
			tipLabel: "决定"
		})
	});
}
var Nc = {
	person: "var(--ov-person)",
	check: "var(--ov-ink)",
	brain: "var(--ov-ink-2)",
	agent: "var(--ov-ink-3)",
	unknown: "var(--ov-ink-4)",
	unclassified: "var(--vs-rework)"
};
function Pc(e) {
	let t = Math.max(1, Math.ceil(e)), n = 1;
	for (let e = 1;; e *= 10) {
		let r = [
			1,
			2,
			5
		].map((t) => t * e).find((e) => Math.ceil(t / e) <= 4);
		if (r) {
			n = r;
			break;
		}
	}
	return Array.from({ length: Math.ceil(t / n) + 1 }, (e, t) => t * n);
}
var Fc = (e) => e.unattended + e.people + e.local + e.pending;
function Ic({ weeks: e, onWeek: t }) {
	return e.every((e) => Fc(e) === 0) ? /* @__PURE__ */ h("section", {
		className: "cto-card",
		"aria-label": "每周合并",
		"data-anchor": "weekly",
		"data-testid": "weekly-empty",
		children: /* @__PURE__ */ g("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ h("h3", { children: "每周合并" }), /* @__PURE__ */ h("span", {
				className: "cto-dim",
				children: "近 12 周还没有合并的需求：合并进默认分支以后，这里按周画出来。"
			})]
		})
	}) : /* @__PURE__ */ h(Lc, {
		weeks: e,
		onWeek: t
	});
}
function Lc({ weeks: e, onWeek: t }) {
	let [n, r] = c(!1), [i, a] = Cc(1100), [o, s] = c(null), l = Fc, u = e.reduce((e, t) => e + l(t), 0), d = Math.max(10, a - 40 - 12) / Math.max(1, e.length), f = Math.min(24, d * .56), p = Pc(Math.max(...e.map(l))), m = p[p.length - 1], _ = (e) => 200 - e / m * 180, v = e.slice(-4).reduce((e, t) => e + l(t), 0);
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "每周合并",
		"data-anchor": "weekly",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [
					/* @__PURE__ */ h("h3", { children: "每周合并" }),
					/* @__PURE__ */ g("span", {
						className: "cto-dim",
						children: [
							"近 12 周合并了 ",
							_c(u),
							" 个需求，最近 4 周 ",
							_c(v),
							" 个 · 按交付方式 · 点一周看那一周合并的"
						]
					}),
					/* @__PURE__ */ h("span", { className: "cto-grow" }),
					/* @__PURE__ */ g("div", {
						className: "cto-seg cto-noprint",
						role: "group",
						"aria-label": "图或表格",
						children: [/* @__PURE__ */ h("button", {
							type: "button",
							"aria-pressed": !n,
							onClick: () => r(!1),
							children: "图"
						}), /* @__PURE__ */ h("button", {
							type: "button",
							"aria-pressed": n,
							onClick: () => r(!0),
							children: "表格"
						})]
					})
				]
			}),
			!n && /* @__PURE__ */ h("div", {
				className: "cto-legend",
				children: bc.map((e) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("i", {
					className: "cto-sw",
					style: { background: Sc[e] }
				}), xc[e]] }, e))
			}),
			/* @__PURE__ */ g("div", {
				className: "cto-plot br-weekly",
				ref: i,
				hidden: n,
				style: { height: 230 },
				children: [/* @__PURE__ */ g("svg", {
					viewBox: `0 0 ${a} 230`,
					role: "img",
					"aria-label": "每周合并的需求，按交付方式堆叠",
					children: [p.map((e) => {
						let t = Math.round(_(e)) + .5;
						return /* @__PURE__ */ g("g", { children: [/* @__PURE__ */ h("line", {
							x1: 40,
							x2: a - 12,
							y1: t,
							y2: t,
							stroke: e === 0 ? "var(--border-strong)" : "var(--border)",
							strokeWidth: 1
						}), /* @__PURE__ */ h("text", {
							x: 32,
							y: t + 4,
							textAnchor: "end",
							children: _c(e)
						})] }, e);
					}), e.map((n, r) => {
						let i = 40 + d * r + d / 2, o = i - f / 2, c = 0, u = bc.filter((e) => n[e] > 0), p = u.map((e, t) => {
							let r = _(c) - (c > 0 ? 2 : 0), i = _(c + n[e]);
							c += n[e];
							let a = r - i;
							if (a <= .5) return null;
							if (t === u.length - 1) {
								let t = Math.min(4, a, f / 2);
								return /* @__PURE__ */ h("path", {
									d: `M${o},${r} V${i + t} Q${o},${i} ${o + t},${i} H${o + f - t} Q${o + f},${i} ${o + f},${i + t} V${r} Z`,
									fill: Sc[e]
								}, e);
							}
							return /* @__PURE__ */ h("rect", {
								x: o,
								y: i,
								width: f,
								height: a,
								fill: Sc[e]
							}, e);
						}), m = l(n), v = i < a / 2;
						return /* @__PURE__ */ g("g", { children: [
							p,
							m > 0 && /* @__PURE__ */ h("text", {
								x: i,
								y: _(m) - 6,
								textAnchor: "middle",
								className: "is-strong",
								children: m
							}),
							r % 2 == (e.length - 1) % 2 && /* @__PURE__ */ h("text", {
								x: i,
								y: 218,
								textAnchor: "middle",
								children: yc(n.week)
							}),
							/* @__PURE__ */ h(Tc, {
								x: 40 + d * r,
								y: 20,
								w: d,
								h: 180,
								onTip: s,
								tipY: 20,
								tipX: v ? o + f + 10 : o - 10,
								side: v ? "right" : "left",
								when: `${yc(n.week)} 起的一周`,
								rows: [
									[_c(m), "合并"],
									...bc.map((e) => [
										_c(n[e]),
										xc[e],
										Sc[e]
									]),
									...t && m > 0 ? [["点击", "看这一周合并的需求"]] : []
								],
								onPick: t && m > 0 ? () => t(n.week) : void 0,
								label: `${yc(n.week)} 起的一周：${m} 个`
							})
						] }, n.week);
					})]
				}), /* @__PURE__ */ h(wc, {
					tip: o,
					width: a
				})]
			}),
			n && /* @__PURE__ */ h("div", {
				className: "cto-weeks",
				children: /* @__PURE__ */ g("table", {
					className: "cto-table",
					children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
						/* @__PURE__ */ h("th", { children: "一周起始" }),
						bc.map((e) => /* @__PURE__ */ h("th", {
							className: "is-num",
							children: xc[e]
						}, e)),
						/* @__PURE__ */ h("th", {
							className: "is-num",
							children: "合计"
						})
					] }) }), /* @__PURE__ */ h("tbody", { children: e.map((e) => /* @__PURE__ */ g("tr", { children: [
						/* @__PURE__ */ g("td", { children: [yc(e.week), " 起"] }),
						bc.map((t) => /* @__PURE__ */ h("td", {
							className: "is-num",
							children: _c(e[t])
						}, t)),
						/* @__PURE__ */ h("td", {
							className: "is-num",
							children: _c(l(e))
						})
					] }, e.week)) })]
				})
			})
		]
	});
}
//#endregion
//#region src/views/Stream.tsx
var Rc = /* @__PURE__ */ new Set([
	"runner",
	"bridge",
	"signer"
]), zc = /* @__PURE__ */ new Set([
	"req",
	"design",
	"release",
	"reflect"
]), Bc = {
	agent: "AI 在本机做",
	runner: "运行机在做",
	person: "等人",
	rework: "返工"
}, Vc = {
	agent: "var(--vs-agent)",
	runner: "var(--s1)",
	person: "var(--vs-person)",
	rework: "var(--vs-rework)"
}, Hc = [
	"agent",
	"runner",
	"person",
	"rework"
], Uc = {
	person: 4,
	rework: 3,
	runner: 2,
	agent: 1
}, Wc = {
	approve: "批准",
	reject: "退回",
	answer: "回答了",
	accepted: "接手",
	rejected: "拒收"
};
function Gc(e, t) {
	return t === "wait" ? "person" : t === "fix" ? "rework" : Rc.has(e.key) ? "runner" : "agent";
}
var Kc = Object.values(Oe).sort((e, t) => t.length - e.length);
function qc(e, t, n) {
	let r = e.events.filter((e) => e.kind === "request" && e.to === t.key && e.at <= n + 1).at(-1);
	return r && Kc.find((e) => r.text.endsWith(e.replace(/审批$/, ""))) || t.title;
}
function Jc(e, t, n, r) {
	return n === "rework" ? Bc.rework : n === "person" ? zc.has(t.key) ? qc(e, t, r) : t.key === "local" ? "会话等人" : `${t.title}等人` : t.key === "local" ? Bc.agent : t.title;
}
function Yc(e, t) {
	let n = e.ended_at ?? t, r = [];
	for (let t of e.actors) for (let e of t.spans) {
		let i = Math.min(e.b ?? n, n);
		i > e.a && r.push({
			a: e.a,
			b: i,
			part: Gc(t, e.kind),
			actor: t
		});
	}
	let i = [...new Set(r.flatMap((e) => [e.a, e.b]))].sort((e, t) => e - t), a = [];
	for (let t = 0; t < i.length - 1; t++) {
		let n = i[t], o = i[t + 1], s = r.filter((e) => e.a <= n && e.b >= o);
		if (!s.length) continue;
		let c = s.sort((e, t) => Uc[t.part] - Uc[e.part] || Number(e.actor.key === "local") - Number(t.actor.key === "local"))[0], l = a[a.length - 1];
		l && l.part === c.part && l.actor === c.actor.key && Math.abs(l.to - n) < 1 ? l.to = o : a.push({
			from: n,
			to: o,
			part: c.part,
			actor: c.actor.key,
			label: Jc(e, c.actor, c.part, n),
			icon: c.part === "person" ? "wait" : c.actor.icon,
			decision: null
		});
	}
	for (let t of a) {
		if (t.part !== "person") continue;
		let n = e.events.find((e) => Wc[e.kind] && (e.to === t.actor || e.from === t.actor) && Math.abs(e.at - t.to) <= 5);
		t.decision = n ? Wc[n.kind] ?? null : null;
	}
	return a;
}
function Xc(e) {
	return Hc.map((t) => ({
		p: t,
		s: e.filter((e) => e.part === t).reduce((e, t) => e + t.to - t.from, 0)
	}));
}
var Zc = (e) => String(e).padStart(2, "0"), Qc = (e) => {
	let t = /* @__PURE__ */ new Date(e * 1e3);
	return `${Zc(t.getHours())}:${Zc(t.getMinutes())}`;
}, $c = (e, t) => t ? `${K(e).slice(5)} ${Qc(e)}` : Qc(e), el = [
	60,
	300,
	600,
	900,
	1800,
	3600,
	7200,
	10800,
	21600,
	43200,
	86400,
	172800,
	604800
];
function tl(e, t) {
	let n = el.find((n) => (t - e) / n <= 7) ?? el[el.length - 1], r = (/* @__PURE__ */ new Date(e * 1e3)).getTimezoneOffset() * 60, i = [];
	for (let a = Math.ceil((e - r) / n) * n + r; a < t; a += n) i.push(a);
	return i;
}
var nl = {
	start: "new",
	approve: "approved",
	reject: "bounce",
	handover: "handover",
	accepted: "bridge",
	rejected: "bounce",
	question: "question",
	answer: "person",
	merge: "merge",
	reflect: "brain"
}, rl = (e) => e === "reject" || e === "rejected" ? "is-back" : e === "question" ? "is-wait" : "is-ok";
function il({ board: e, at: t, onAt: n }) {
	let [r, i] = c(!1), a = e ? Yc(e, t) : [];
	if (!e || !a.length) return null;
	let o = a[0].from, s = a[a.length - 1].to, l = e.events.find((e) => e.kind === "start")?.at ?? o, u = Math.max(s, e.ended_at ?? t), d = Hc.filter((e) => a.some((t) => t.part === e)), f = (e) => e.part === "person" ? "人" : e.part === "runner" ? e.label : e.part === "rework" ? "AI" : "AI（本机会话）", p = fe((/* @__PURE__ */ new Date(o * 1e3)).toISOString()) !== fe((/* @__PURE__ */ new Date(s * 1e3)).toISOString());
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "价值流",
		"data-testid": "item-stream",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [
					/* @__PURE__ */ h("h3", { children: "价值流" }),
					/* @__PURE__ */ g("span", {
						className: "cto-dim",
						children: [
							"从开工到",
							e.ended_at ? "合并" : "此刻",
							"，共 ",
							G(u - l),
							u - s >= 600 ? `（最后 ${G(u - s)} 没有动静）` : "",
							" · 点任一段或任一时刻，到需求看板的那一刻"
						]
					}),
					/* @__PURE__ */ h("span", { className: "cto-grow" }),
					/* @__PURE__ */ g("div", {
						className: "cto-seg",
						role: "group",
						"aria-label": "图或表格",
						children: [/* @__PURE__ */ h("button", {
							type: "button",
							"aria-pressed": !r,
							onClick: () => i(!1),
							children: "图"
						}), /* @__PURE__ */ h("button", {
							type: "button",
							"aria-pressed": r,
							onClick: () => i(!0),
							children: "表格"
						})]
					})
				]
			}),
			/* @__PURE__ */ g("div", {
				className: "cto-legend",
				children: [d.map((e) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("i", {
					className: "cto-sw",
					style: { background: Vc[e] }
				}), Bc[e]] }, e)), /* @__PURE__ */ h("span", {
					className: "cto-dim",
					children: "· 色块上方是谁在做，下方是关键时刻 · 安静的时段没画"
				})]
			}),
			r ? /* @__PURE__ */ h("div", {
				className: "br-scroll",
				children: /* @__PURE__ */ g("table", {
					className: "cto-table",
					"aria-label": "价值流的每一段",
					children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
						/* @__PURE__ */ h("th", { children: "时间" }),
						/* @__PURE__ */ h("th", { children: "环节" }),
						/* @__PURE__ */ h("th", { children: "谁" }),
						/* @__PURE__ */ h("th", {
							className: "is-num",
							children: "用时"
						}),
						/* @__PURE__ */ h("th", { children: "结论" }),
						/* @__PURE__ */ h("th", {})
					] }) }), /* @__PURE__ */ h("tbody", { children: a.map((e) => /* @__PURE__ */ g("tr", { children: [
						/* @__PURE__ */ g("td", {
							className: "kt-mono",
							children: [
								$c(e.from, p),
								"–",
								$c(e.to, p)
							]
						}),
						/* @__PURE__ */ h("td", { children: /* @__PURE__ */ g("span", {
							className: "cto-kind",
							children: [/* @__PURE__ */ h("i", {
								className: "cto-sw",
								style: { background: Vc[e.part] }
							}), e.label]
						}) }),
						/* @__PURE__ */ h("td", { children: f(e) }),
						/* @__PURE__ */ h("td", {
							className: "is-num",
							children: G(e.to - e.from)
						}),
						/* @__PURE__ */ h("td", { children: e.decision ?? "" }),
						/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h("button", {
							type: "button",
							className: "cto-link",
							onClick: () => n(e.from),
							children: "看板 ↗"
						}) })
					] }, `${e.from}-${e.actor}`)) })]
				})
			}) : /* @__PURE__ */ h(al, {
				board: e,
				segs: a,
				days: p,
				onAt: n
			})
		]
	});
}
function al({ board: e, segs: t, days: n, onAt: r }) {
	let [i, a] = Cc(1100), [o, s] = c(null), l = t[0].from, u = t[t.length - 1].to, d = Math.max(60, u - l), f = Math.max(10, a - 6 - 6), p = (e) => 6 + (Math.min(Math.max(e, l), l + d) - l) / d * f, _ = n ? 112 : 60, v = tl(l, u).filter((e) => p(e) - p(l) > _ && p(u) - p(e) > _), y = [];
	for (let t of e.events.filter((e) => nl[e.kind] && e.at >= l - 1 && e.at <= u + 1).sort((e, t) => e.at - t.at)) {
		let e = Math.min(Math.max(p(t.at), 18), a - 6 - 12), n = y[y.length - 1];
		n && e - n.mx < 6 ? n.evs.push(t) : y.push({
			mx: e,
			evs: [t]
		});
	}
	let b = [], x = y.map((e) => {
		let t = b.findIndex((t) => e.mx - t >= 26);
		return t < 0 && (t = b.length < 3 ? b.length : 2), b[t] = e.mx, {
			...e,
			my: 148 + t * 26
		};
	}), S = 148 + Math.max(1, b.length) * 26 + 4;
	return /* @__PURE__ */ g("div", {
		className: "br-vs",
		ref: i,
		children: [/* @__PURE__ */ g("svg", {
			viewBox: `0 0 ${a} ${S}`,
			height: S,
			role: "group",
			"aria-label": "价值流：" + t.map((e) => `${e.label} ${G(e.to - e.from)}`).join("，"),
			children: [
				[
					l,
					...v,
					u
				].map((e, t, r) => /* @__PURE__ */ g("g", { children: [/* @__PURE__ */ h("line", {
					x1: p(e),
					x2: p(e),
					y1: 30,
					y2: 112,
					stroke: "var(--border)",
					strokeWidth: 1
				}), /* @__PURE__ */ h("text", {
					x: p(e),
					y: 128,
					textAnchor: t === 0 ? "start" : t === r.length - 1 ? "end" : "middle",
					children: $c(e, n && (t === 0 || t === r.length - 1 || Qc(e) === "00:00"))
				})] }, `${e}-${t}`)),
				/* @__PURE__ */ h("line", {
					x1: 6,
					x2: a - 6,
					y1: 112,
					y2: 112,
					stroke: "var(--border-strong)",
					strokeWidth: 1
				}),
				t.map((e, i) => {
					let a = p(e.from), o = p(e.to), c = Math.max(2, o - a - (i < t.length - 1 ? 2 : 0)), l = (c - 4) / 12.5, u = qn(e.label, l), d = `${G(e.to - e.from)}${e.decision ? ` · ${e.decision}` : ""}`, f = qn(Gn(d) <= l ? d : G(e.to - e.from), l);
					return /* @__PURE__ */ g("g", {
						className: "cto-vs-seg",
						children: [
							/* @__PURE__ */ h("rect", {
								x: a,
								y: 36,
								width: c,
								height: 24,
								rx: i === 0 || i === t.length - 1 ? 4 : 1,
								fill: Vc[e.part]
							}),
							c >= 22 && /* @__PURE__ */ g("g", {
								className: `cto-vs-chip ${e.part === "person" ? "is-wait" : "is-ok"}`,
								transform: `translate(${a},8)`,
								children: [/* @__PURE__ */ h("rect", {
									width: 20,
									height: 20,
									rx: 6
								}), /* @__PURE__ */ h(Te, {
									role: e.icon,
									cx: 10,
									cy: 10,
									size: 14
								})]
							}),
							c >= 58 && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("text", {
								x: a,
								y: 78,
								className: "is-strong",
								children: u
							}), /* @__PURE__ */ h("text", {
								x: a,
								y: 94,
								children: f
							})] }),
							/* @__PURE__ */ h(Tc, {
								x: a,
								y: 6,
								w: Math.max(8, c),
								h: 96,
								onTip: s,
								tipY: 100,
								onPick: () => r(e.from),
								label: `${e.label} ${G(e.to - e.from)}`,
								when: `${$c(e.from, n)} – ${$c(e.to, n)} · ${Bc[e.part]}`,
								rows: [
									[
										G(e.to - e.from),
										e.label,
										Vc[e.part]
									],
									...e.decision ? [[e.decision, "结论"]] : [],
									["点击", "到需求看板的这一刻"]
								]
							})
						]
					}, `${e.from}-${e.actor}`);
				}),
				x.map(({ mx: e, my: t, evs: n }) => {
					let i = n[0];
					return /* @__PURE__ */ g("g", {
						className: `cto-vs-moment ${rl(i.kind)}`,
						"data-testid": "vs-moment",
						children: [
							/* @__PURE__ */ h("line", {
								x1: e,
								x2: e,
								y1: 60,
								y2: t - 11,
								className: "cto-vs-tick"
							}),
							/* @__PURE__ */ h("circle", {
								cx: e,
								cy: t,
								r: 11
							}),
							/* @__PURE__ */ h(Te, {
								role: nl[i.kind],
								cx: e,
								cy: t,
								size: 14
							}),
							n.length > 1 && /* @__PURE__ */ g("g", {
								className: "br-vs-n",
								children: [/* @__PURE__ */ h("circle", {
									cx: e + 10,
									cy: t - 9,
									r: 7
								}), /* @__PURE__ */ h("text", {
									x: e + 10,
									y: t - 5.5,
									textAnchor: "middle",
									children: n.length
								})]
							}),
							/* @__PURE__ */ h("title", { children: n.map((e) => `${Qc(e.at)} ${e.text}`).join("\n") }),
							/* @__PURE__ */ h(Tc, {
								x: e - 13,
								y: t - 13,
								w: 26,
								h: 26,
								onTip: s,
								tipY: t + 16,
								when: Qc(i.at),
								onPick: () => r(i.at),
								label: `${Qc(i.at)} ${n.map((e) => e.text).join("；")}：看板回放到这一刻`,
								rows: [...n.slice(0, 5).map((e) => [Qc(e.at), e.text]), ["点击", "看板回放到这一刻"]]
							})
						]
					}, `${i.seq}`);
				})
			]
		}), /* @__PURE__ */ h(wc, {
			tip: o,
			width: a
		})]
	});
}
var ol = {
	poll: {
		name: "看 MR",
		did: "看了 MR"
	},
	runnerd: {
		name: "准备工作区",
		did: "准备好工作区"
	},
	prepared: {
		name: "准备工作区",
		did: "准备好工作区"
	},
	dispatch: {
		name: "派给会话",
		did: "派给会话"
	},
	watch: {
		name: "看会话",
		did: "看了会话"
	},
	collect: {
		name: "收结果",
		did: "收回结果"
	},
	reconcile: {
		name: "对账",
		did: "对了账"
	}
}, sl = {
	answer: "回答的凭证",
	handoff: "交接的合同"
}, cl = (e) => sl[e] ?? "其他", ll = (e) => {
	let [t, n] = e.split(/\s+/, 2);
	return sl[t] ? `${t === "answer" ? "回答" : "交接"} ${n ?? ""}`.trim() : e;
}, ul = (e, t = !0) => {
	let n = /^RUN-(.+)-(\d+)$/.exec(e);
	return n ? `${t ? `${n[1]} 的` : ""}第 ${n[2]} 次运行` : "一次运行";
}, dl = (e) => /[\u3400-\u9fff]/.test(e), fl = (e) => Array.from(new Set(e.split("；").map((e) => e.split(":", 1)[0].trim()).filter(Boolean))).map((e) => ol[e]?.name ?? "其他一步"), pl = {
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
		tone: "warn",
		hint: "桥每轮看会话，看到了就接着做；一直这样要人看一下"
	},
	failed: {
		label: "没能开始",
		tone: "bad",
		hint: "工作区没建成，或接手消息一直送不进会话"
	},
	merged: {
		label: "已合并",
		tone: "ok"
	},
	closed: {
		label: "已关闭",
		tone: "idle"
	}
}, ml = (e) => pl[e] ?? {
	label: e,
	tone: "idle"
}, hl = {
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
}, gl = {
	sending: {
		label: "正在送",
		tone: "run"
	},
	interrupted: {
		label: "送的时候桥停了",
		tone: "warn"
	},
	sent: {
		label: "送到了",
		tone: "ok"
	},
	unknown: {
		label: "不知道送到没有",
		tone: "warn"
	},
	dropped: {
		label: "不送了",
		tone: "bad"
	}
}, _l = (e) => gl[e] ?? {
	label: e,
	tone: "idle"
}, vl = {
	ci_wait: "warn",
	ci_person: "warn",
	ci_red: "bad",
	runnerd_retry: "warn",
	runnerd_silent: "bad",
	gaveup: "bad",
	setup: "warn",
	send_unknown: "warn",
	held: "warn",
	failed: "bad",
	nobody: "bad",
	outbox_unknown: "warn",
	outbox_interrupted: "warn",
	outbox_dropped: "bad",
	queued: "idle"
}, yl = (e) => vl[e] ?? (/^(ci|runnerd)_/.test(e) ? "warn" : "idle"), bl = {
	bad: "✕",
	warn: "!"
}, xl = [{
	file: "bridge.json",
	what: "桥"
}, {
	file: "runnerd.json",
	what: "运行机（brain-runnerd）"
}], Sl = {
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
		hint: "交接标签刚被拿掉（重新交接、再打一次标签时会这样）：下一轮再看"
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
}, Cl = (e) => Sl[e] ?? {
	label: e,
	tone: "idle",
	hint: ""
}, wl = {
	rejected: "is-conflict",
	waiting: "is-pending",
	unlabelled: "is-pending",
	error: "is-pending",
	seen: "is-seen"
}, Tl = (e, t) => e === "runs" ? ml(t) : e === "decisions" ? st(t) : e === "outbox" ? _l(t) : hl[t] ?? {
	label: t,
	tone: "idle"
}, El = [
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
		text: "单独的签名服务​签合同"
	},
	{
		icon: "runner",
		title: "运行机会话",
		text: "运行机上的会话​接着做"
	},
	{
		icon: "release",
		title: "回答、验收",
		text: "在 MR 上，以\xA0GitLab\xA0身份"
	}
];
function Dl({ status: t, go: n, reloadStatus: r, pollMs: i }) {
	let a = u(), o = f(), s = !!t?.app.team, c = N(s ? E.team() : null, i ?? 1e4), l = P(() => a.post(E.teamLoop(), {})), d = async () => {
		await l.run() && (c.reload(), r());
	};
	if (t && !s) return /* @__PURE__ */ g("main", {
		className: "kt-root br-view tm-root",
		"data-testid": "team",
		children: [/* @__PURE__ */ h("style", { children: Bl }), /* @__PURE__ */ h(Vt, {
			testid: "team-off",
			title: "这台机器不是团队运行机",
			text: ["这台机器没开团队模式。要当团队运行机：在设置里打开团队模式，填上桥和运行机工作区的配置文件。"],
			punch: "运行机接手交接过来的需求，问题和验收都在 MR 上，以 GitLab 身份回答。",
			flow: El,
			children: /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-primary",
				onClick: () => n({ kind: "settings" }),
				children: [/* @__PURE__ */ h(Y, {
					role: "settings",
					size: 16
				}), "去设置"]
			})
		})]
	});
	let p = c.data, _ = p?.status ?? t?.team, v = _ ? _.enabled ? _.ok ? {
		label: "正常",
		tone: "ok"
	} : {
		label: "有问题",
		tone: "bad"
	} : {
		label: "没开",
		tone: "idle"
	} : null;
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view tm-root",
		"data-testid": "team",
		children: [
			/* @__PURE__ */ h("style", { children: Bl }),
			_?.same_user && /* @__PURE__ */ g("div", {
				className: "br-banner tm-same",
				role: "alert",
				"data-testid": "signer-same-user",
				children: [/* @__PURE__ */ g("span", {
					className: "br-row",
					children: [/* @__PURE__ */ h(Y, {
						role: "signer",
						size: 18
					}), /* @__PURE__ */ h("b", {
						className: "br-strong",
						children: "签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用"
					})]
				}), /* @__PURE__ */ g("span", {
					className: "tm-do",
					children: [/* @__PURE__ */ h("b", { children: "做什么" }), "正式给团队用之前，让签名服务换成另一个系统用户来跑（app 和 AI 的会话都改不了它的文件）。"]
				})]
			}),
			/* @__PURE__ */ g("header", {
				className: "tm-top",
				children: [/* @__PURE__ */ h(Y, {
					role: "runner",
					size: 26,
					className: "tm-top-icon"
				}), /* @__PURE__ */ g("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ h("h2", { children: "运行机" }), /* @__PURE__ */ h("p", { children: "团队运行机：交接、运行、签名" })]
				})]
			}),
			/* @__PURE__ */ h(zt, {
				loading: c.loading,
				error: c.error,
				has: !!p
			}),
			_ && v && /* @__PURE__ */ g("section", {
				className: `br-card tm-status is-${v.tone === "ok" ? "ok" : v.tone === "bad" ? "bad" : "idle"}`,
				"aria-label": "运行机状态",
				children: [
					/* @__PURE__ */ g("div", {
						className: "tm-status-row",
						children: [
							/* @__PURE__ */ h("span", {
								className: "tm-status-icon",
								children: /* @__PURE__ */ h(Y, {
									role: "bridge",
									size: 30
								})
							}),
							/* @__PURE__ */ g("div", {
								className: "tm-status-main",
								children: [/* @__PURE__ */ g("div", {
									className: "br-row",
									children: [/* @__PURE__ */ h("h3", { children: "桥" }), /* @__PURE__ */ g("span", {
										className: `br-chip kt-pill tone-${v.tone}${_.enabled && _.ok ? " is-live" : ""}`,
										children: [/* @__PURE__ */ h("i", {
											"aria-hidden": "true",
											children: "●"
										}), v.label]
									})]
								}), /* @__PURE__ */ g("div", {
									className: "tm-facts",
									children: [/* @__PURE__ */ g("span", { children: ["上一轮 ", /* @__PURE__ */ h("b", { children: _.last_loop_at ? se(_.last_loop_at) : "还没跑过" })] }), /* @__PURE__ */ g("span", { children: ["签名 ", /* @__PURE__ */ g("b", { children: [
										"等签名 ",
										_.signer.pending,
										" · 拒签 ",
										_.signer.refused
									] })] })]
								})]
							}),
							/* @__PURE__ */ h("span", { className: "br-grow" }),
							/* @__PURE__ */ g("button", {
								type: "button",
								className: "br-btn is-primary is-big",
								disabled: l.busy || !_.enabled,
								onClick: () => void d(),
								children: [/* @__PURE__ */ h($, {
									name: "Play",
									size: 15
								}), l.busy ? "正在跑…" : "现在跑一轮"]
							})
						]
					}),
					_.error && /* @__PURE__ */ h(Ol, { st: _ }),
					_.loop_error && /* @__PURE__ */ g("div", {
						className: "tm-loop-error",
						"data-testid": "loop-error",
						children: [
							/* @__PURE__ */ g("p", {
								className: "br-bad-text",
								children: [/* @__PURE__ */ h("b", { children: "上一轮有一步没成：" }), fl(_.loop_error).join("、")]
							}),
							/* @__PURE__ */ g("span", {
								className: "tm-do",
								children: [/* @__PURE__ */ h("b", { children: "做什么" }), "下一轮会自动再试；一直这样的话，把「细节」里的原话发给管运行机的人。"]
							}),
							/* @__PURE__ */ g("details", {
								className: "br-raw",
								children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: _.loop_error })]
							})
						]
					}),
					l.result && /* @__PURE__ */ h(Al, { r: l.result }),
					l.error && /* @__PURE__ */ h("p", {
						className: "br-error",
						role: "alert",
						children: l.error
					})
				]
			}),
			p && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("section", {
					className: "br-kpis tm-kpis",
					"aria-label": "账本",
					children: [
						/* @__PURE__ */ h(jl, {
							k: "runs",
							label: "运行",
							unit: "个",
							counts: p.ledger.runs
						}),
						/* @__PURE__ */ h(jl, {
							k: "decisions",
							label: "问题",
							unit: "个",
							counts: p.ledger.decisions
						}),
						/* @__PURE__ */ h(jl, {
							k: "handoffs",
							label: "交接",
							unit: "次",
							counts: p.ledger.handoffs,
							big: "accepted"
						}),
						/* @__PURE__ */ h(Ml, { counts: p.ledger.outbox ?? {} }),
						/* @__PURE__ */ h(Nl, { signer: p.signer })
					]
				}),
				/* @__PURE__ */ h(Pl, {
					rows: p.handovers,
					at: _?.last_loop_at ?? null
				}),
				/* @__PURE__ */ g("section", {
					className: "br-card",
					"aria-label": "运行",
					children: [/* @__PURE__ */ g("header", { children: [
						/* @__PURE__ */ h(Y, {
							role: "runner",
							size: 18
						}),
						/* @__PURE__ */ h("h3", { children: "运行" }),
						/* @__PURE__ */ g("span", {
							className: "br-dim br-small",
							children: [p.runs.length, " 个"]
						})
					] }), p.runs.length === 0 ? /* @__PURE__ */ h("p", {
						className: "br-empty",
						children: "还没有运行：MR 打上交接标签、桥接手以后，就会出现在这里。"
					}) : /* @__PURE__ */ h("div", {
						className: "br-scroll",
						children: /* @__PURE__ */ g("table", {
							className: "cto-table tm-runs",
							children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
								/* @__PURE__ */ h("th", { children: "运行" }),
								/* @__PURE__ */ h("th", { children: "需求" }),
								/* @__PURE__ */ h("th", { children: "项目" }),
								/* @__PURE__ */ h("th", { children: "状态" }),
								/* @__PURE__ */ h("th", { children: "MR" }),
								/* @__PURE__ */ h("th", { children: "更新" }),
								/* @__PURE__ */ h("th", { children: "会话" })
							] }) }), /* @__PURE__ */ h("tbody", { children: p.runs.map((t) => {
								let r = t.notes ?? [], i = ml(t.state).hint;
								return /* @__PURE__ */ g(e, { children: [/* @__PURE__ */ g("tr", {
									"data-state": t.state,
									className: r.length ? "has-notes" : void 0,
									children: [
										/* @__PURE__ */ h("td", {
											title: t.run_id,
											children: ul(t.run_id, !1)
										}),
										/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h("button", {
											type: "button",
											className: "br-link br-key",
											onClick: () => n({
												kind: "item",
												repo: "runner",
												key: t.req,
												from: "team"
											}),
											children: t.req
										}) }),
										/* @__PURE__ */ h("td", {
											className: "br-dim",
											children: t.project
										}),
										/* @__PURE__ */ h("td", { children: /* @__PURE__ */ g("span", {
											className: "tm-state",
											children: [/* @__PURE__ */ h(Il, { state: t.state }), i && /* @__PURE__ */ h("span", {
												className: "tm-state-hint",
												children: i
											})]
										}) }),
										/* @__PURE__ */ h("td", { children: /* @__PURE__ */ g(dt, {
											href: t.mr_url,
											children: ["!", t.iid]
										}) }),
										/* @__PURE__ */ h("td", {
											className: "br-dim",
											children: q(t.updated)
										}),
										/* @__PURE__ */ h("td", { children: t.slot ? /* @__PURE__ */ g("button", {
											type: "button",
											className: "br-btn is-small",
											onClick: () => o(`/chat?sid=${encodeURIComponent(t.slot)}`),
											children: [/* @__PURE__ */ h($, {
												name: "MessageSquare",
												size: 13
											}), Z.openSession]
										}) : /* @__PURE__ */ h("span", {
											className: "br-dim",
											children: "—"
										}) })
									]
								}), r.length > 0 && /* @__PURE__ */ h("tr", {
									className: "tm-notes-row",
									"data-notes": t.run_id,
									children: /* @__PURE__ */ h("td", {
										colSpan: 7,
										children: /* @__PURE__ */ h(Ll, {
											runId: t.run_id,
											notes: r
										})
									})
								})] }, t.run_id);
							}) })]
						})
					})]
				}),
				/* @__PURE__ */ h(Rl, { rows: p.hooks ?? [] }),
				/* @__PURE__ */ h(Fl, { signer: p.signer }),
				/* @__PURE__ */ h(zl, { rows: p.config ?? [] })
			] })
		]
	});
}
function Ol({ st: e }) {
	let t = !!e.error_todo, n = t ? e.error_raw ?? "" : e.error, r = t ? e.error : "桥没准备好";
	return /* @__PURE__ */ g("div", {
		className: "tm-loop-error",
		"data-testid": "team-error",
		children: [
			/* @__PURE__ */ h("p", {
				className: "br-bad-text",
				children: /* @__PURE__ */ h("b", { children: r })
			}),
			/* @__PURE__ */ g("span", {
				className: "tm-do",
				children: [/* @__PURE__ */ h("b", { children: "做什么" }), t ? e.error_todo : kl]
			}),
			n && n !== r && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: n })]
			})
		]
	});
}
var kl = "看设置里团队模式填的两个配置文件（桥的、运行机的）对不对，改好再跑一轮";
function Al({ r: e }) {
	let t = Object.entries(e.summary).filter(([e]) => ol[e]), n = [...Object.entries(e.summary).filter(([e]) => !ol[e]).map(([e, t]) => `${e} ${t}`), e.error].filter(Boolean).join("\n");
	return /* @__PURE__ */ g("div", {
		className: `tm-loop ${e.ok ? "is-ok" : "is-bad"}`,
		role: "status",
		"data-testid": "loop-result",
		children: [
			/* @__PURE__ */ h("b", { children: e.ok ? "这一轮跑完了" : "这一轮没跑成" }),
			t.map(([e, t]) => /* @__PURE__ */ g("span", {
				className: "br-tag",
				children: [
					ol[e].did,
					" ",
					t,
					" 个"
				]
			}, e)),
			!e.ok && /* @__PURE__ */ g("span", {
				className: "tm-do",
				children: [/* @__PURE__ */ h("b", { children: "做什么" }), "等一会儿再跑一轮；还不成就把「细节」里的原话发给管运行机的人。"]
			}),
			n && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: n })]
			})
		]
	});
}
function jl({ k: e, label: t, unit: n, counts: r, big: i, order: a, mark: o, note: s }) {
	let c = (e) => a && a.includes(e) ? a.indexOf(e) : a?.length ?? 0, l = Object.entries(r).filter(([, e]) => e > 0).sort((e, t) => c(e[0]) - c(t[0])), u = l.reduce((e, [, t]) => e + t, 0), d = i ? r[i] ?? 0 : u;
	return /* @__PURE__ */ g("div", {
		className: `br-kpi tm-kpi${o ? ` has-${o}` : ""}`,
		"data-ledger": e,
		children: [
			/* @__PURE__ */ h("div", {
				className: "br-kpi-label",
				children: t
			}),
			/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
				className: "br-kpi-big",
				children: d
			}), /* @__PURE__ */ h("span", {
				className: "br-kpi-of",
				children: i ? `/${u}` : n
			})] }),
			u > 0 ? /* @__PURE__ */ h("div", {
				className: "tm-stack",
				role: "img",
				"aria-label": l.map(([t, n]) => `${Tl(e, t).label} ${n}`).join("，"),
				children: l.map(([t, n]) => /* @__PURE__ */ h("i", {
					className: `tone-${Tl(e, t).tone}`,
					style: { flexGrow: n }
				}, t))
			}) : /* @__PURE__ */ h("div", {
				className: "tm-stack is-empty",
				"aria-hidden": "true",
				children: /* @__PURE__ */ h("i", {})
			}),
			/* @__PURE__ */ h("div", {
				className: "tm-legs",
				children: l.length === 0 ? /* @__PURE__ */ h("span", {
					className: "br-dim",
					children: "—"
				}) : l.map(([t, n]) => /* @__PURE__ */ g("span", {
					className: "tm-leg",
					children: [
						/* @__PURE__ */ h("i", {
							className: `tone-${Tl(e, t).tone}`,
							"aria-hidden": "true"
						}),
						Tl(e, t).label,
						" ",
						/* @__PURE__ */ h("b", { children: n })
					]
				}, t))
			}),
			s && /* @__PURE__ */ h("div", {
				className: "br-kpi-note",
				children: s
			})
		]
	});
}
function Ml({ counts: e }) {
	let t = (t) => e[t] ?? 0, n = t("unknown") + t("interrupted");
	return /* @__PURE__ */ h(jl, {
		k: "outbox",
		label: "送进会话的消息",
		unit: "条",
		counts: e,
		big: "sent",
		order: Object.keys(gl),
		mark: t("dropped") ? "bad" : n ? "warn" : void 0,
		note: n ? "桥每轮看会话：看到了就算送到，一直这样要人看一下" : void 0
	});
}
function Nl({ signer: e }) {
	let t = e.pending.length, n = e.refused.length, r = e.waiting.length;
	return /* @__PURE__ */ g("div", {
		className: `br-kpi tm-kpi${t ? " is-wait" : n ? " is-bad" : ""}`,
		"data-ledger": "signer",
		children: [
			/* @__PURE__ */ h("div", {
				className: "br-kpi-label",
				children: "签名"
			}),
			/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
				className: "br-kpi-big",
				children: t
			}), /* @__PURE__ */ h("span", {
				className: "br-kpi-of",
				children: "等签名"
			})] }),
			/* @__PURE__ */ g("div", {
				className: "tm-cells",
				"aria-hidden": "true",
				children: [
					e.pending.map((e) => /* @__PURE__ */ h("i", {
						className: "is-wait",
						title: `等签名：${cl(e.kind)}`
					}, e.req_id)),
					e.refused.map((e) => /* @__PURE__ */ h("i", {
						className: "is-bad",
						title: `拒签：${cl(e.kind)}`
					}, e.req_id)),
					e.waiting.map((e) => /* @__PURE__ */ h("i", {
						className: "is-warn",
						title: `上一轮没等到：${ll(e.ref)}`
					}, e.ref))
				]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-kpi-note",
				children: [
					"拒签 ",
					/* @__PURE__ */ h("b", {
						className: n ? "br-bad-text" : "",
						children: n
					}),
					" · 上一轮没等到 ",
					/* @__PURE__ */ h("b", { children: r })
				]
			})
		]
	});
}
function Pl({ rows: e, at: t }) {
	let n = e.filter((e) => e.result === "accepted").length, r = e.filter((e) => e.result === "rejected").length, i = e.filter((e) => e.result === "waiting" || e.result === "unlabelled" || e.result === "error").length;
	return /* @__PURE__ */ g("section", {
		className: "kt-card tm-ho",
		"aria-label": "交接",
		"data-testid": "handovers",
		children: [/* @__PURE__ */ g("header", {
			className: "kt-card-head",
			children: [
				/* @__PURE__ */ h(Y, {
					role: "handover",
					size: 18
				}),
				/* @__PURE__ */ h("h2", { children: "交接" }),
				/* @__PURE__ */ h("span", {
					className: "kt-dim",
					children: "上一轮看到的打着交接标签的 MR"
				}),
				/* @__PURE__ */ h("span", { className: "kt-grow" }),
				e.length > 0 && /* @__PURE__ */ g("span", {
					className: "br-row br-small",
					children: [
						n > 0 && /* @__PURE__ */ g("span", {
							className: "tone-ok",
							children: ["接手 ", n]
						}),
						r > 0 && /* @__PURE__ */ g("span", {
							className: "tone-bad",
							children: ["拒绝 ", r]
						}),
						i > 0 && /* @__PURE__ */ g("span", {
							className: "tone-warn",
							children: ["下一轮再看 ", i]
						})
					]
				})
			]
		}), e.length === 0 ? /* @__PURE__ */ h("p", {
			className: "br-empty",
			children: "上一轮没有打着交接标签的 MR。"
		}) : /* @__PURE__ */ g("div", {
			className: "tm-belt-row",
			children: [
				/* @__PURE__ */ g("span", {
					className: "kt-belt-end",
					title: "桥上一轮看 MR 的时候",
					children: [
						/* @__PURE__ */ h(Y, {
							role: "bridge",
							size: 14
						}),
						"上一轮",
						t ? ` · ${se(t)}` : ""
					]
				}),
				/* @__PURE__ */ h("ol", {
					className: "kt-belt tm-belt",
					children: e.map((e) => {
						let t = Cl(e.result), n = e.error ? dl(e.error) ? e.error : "没查成：原话在细节里" : t.hint;
						return /* @__PURE__ */ g("li", {
							className: `kt-belt-chip ${wl[e.result] ?? ""}`,
							"data-result": e.result,
							title: e.sha ? `交接的提交 ${e.sha.slice(0, 12)}` : void 0,
							children: [
								/* @__PURE__ */ g("span", {
									className: "tm-chip-top",
									children: [/* @__PURE__ */ g(dt, {
										href: e.mr_url,
										className: "kt-belt-role tm-mr",
										children: [
											e.project,
											"!",
											e.iid
										]
									}), /* @__PURE__ */ h("span", {
										className: `kt-pill tone-${t.tone}`,
										children: t.label
									})]
								}),
								n && /* @__PURE__ */ h("span", {
									className: "tm-hint",
									children: n
								}),
								e.error && !dl(e.error) && /* @__PURE__ */ g("details", {
									className: "br-raw tm-hint",
									children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.error })]
								})
							]
						}, `${e.project}!${e.iid}`);
					})
				}),
				/* @__PURE__ */ g("span", {
					className: "kt-belt-end is-head",
					title: "接手的交接在运行机上接着做",
					children: [/* @__PURE__ */ h(Y, {
						role: "runner",
						size: 14
					}), "运行机"]
				})
			]
		})]
	});
}
function Fl({ signer: e }) {
	return /* @__PURE__ */ g("section", {
		className: "br-card",
		"aria-label": "签名",
		children: [/* @__PURE__ */ g("header", { children: [
			/* @__PURE__ */ h(Y, {
				role: "signer",
				size: 18
			}),
			/* @__PURE__ */ h("h3", { children: "签名" }),
			/* @__PURE__ */ h("span", {
				className: "br-dim br-small",
				children: "单独的签名服务：交接的合同、回答的凭证"
			})
		] }), /* @__PURE__ */ g("div", {
			className: "tm-signer",
			children: [
				/* @__PURE__ */ g("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ g("h4", { children: ["等签名 ", /* @__PURE__ */ h("span", {
						className: "kt-badge tone-wait",
						children: e.pending.length
					})] }), e.pending.length === 0 ? /* @__PURE__ */ h("p", {
						className: "br-empty",
						children: "没有。"
					}) : /* @__PURE__ */ h("ul", {
						className: "tm-sigs",
						children: e.pending.map((e) => /* @__PURE__ */ g("li", {
							className: "tm-sig is-wait",
							children: [/* @__PURE__ */ g("span", {
								className: "br-row",
								children: [
									/* @__PURE__ */ h("b", { children: cl(e.kind) }),
									/* @__PURE__ */ h("span", { className: "br-grow" }),
									/* @__PURE__ */ h("span", {
										className: "br-dim br-small",
										children: q(e.since)
									})
								]
							}), /* @__PURE__ */ h("span", {
								className: "br-dim br-small",
								title: `${e.run_id} · ${e.req_id}`,
								children: ul(e.run_id)
							})]
						}, e.req_id))
					})]
				}),
				/* @__PURE__ */ g("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ g("h4", { children: ["拒签 ", /* @__PURE__ */ h("span", {
						className: "kt-badge tone-bad",
						children: e.refused.length
					})] }), e.refused.length === 0 ? /* @__PURE__ */ h("p", {
						className: "br-empty",
						children: "没有。"
					}) : /* @__PURE__ */ h("ul", {
						className: "tm-sigs",
						children: e.refused.map((e) => /* @__PURE__ */ g("li", {
							className: "tm-sig is-bad",
							children: [
								/* @__PURE__ */ h("span", {
									className: "br-row",
									title: e.req_id,
									children: /* @__PURE__ */ h("b", { children: cl(e.kind) })
								}),
								/* @__PURE__ */ h("ul", {
									className: "br-list br-bad-text",
									children: e.reasons.map((e, t) => /* @__PURE__ */ h("li", { children: e }, t))
								}),
								e.raw.some(Boolean) && /* @__PURE__ */ g("details", {
									className: "br-raw",
									children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw.join("\n") })]
								})
							]
						}, e.req_id))
					})]
				}),
				e.waiting.length > 0 && /* @__PURE__ */ g("div", {
					className: "tm-sig-col",
					children: [/* @__PURE__ */ h("h4", { children: "上一轮没等到签名（下一轮再要同一张凭证）" }), /* @__PURE__ */ h("ul", {
						className: "tm-sigs",
						"data-testid": "signer-waiting",
						children: e.waiting.map((e) => /* @__PURE__ */ g("li", {
							className: "tm-sig is-warn",
							children: [/* @__PURE__ */ g("span", {
								className: "br-row",
								children: [
									/* @__PURE__ */ h("b", { children: ll(e.ref) }),
									/* @__PURE__ */ h("span", {
										className: "br-tag",
										children: cl(e.kind)
									}),
									/* @__PURE__ */ h("span", { className: "br-grow" }),
									/* @__PURE__ */ h("span", {
										className: "br-dim br-small",
										children: q(e.since)
									})
								]
							}), /* @__PURE__ */ h("span", {
								className: "br-dim br-small",
								title: e.run_id,
								children: ul(e.run_id)
							})]
						}, e.ref))
					})]
				})
			]
		})]
	});
}
function Il({ state: e }) {
	let t = ml(e), n = e === "dispatched" || e === "signing";
	return /* @__PURE__ */ h("span", {
		className: `br-chip kt-pill tone-${t.tone}${n ? " is-live" : ""}`,
		"data-state": e,
		title: t.hint,
		children: t.label
	});
}
function Ll({ runId: e, notes: t }) {
	return /* @__PURE__ */ h("ul", {
		className: "tm-notes",
		"aria-label": `${ul(e)}：桥记着的事`,
		children: t.map((e, t) => {
			let n = yl(e.kind);
			return /* @__PURE__ */ g("li", {
				className: `tm-note tone-${n}`,
				"data-kind": e.kind,
				children: [
					/* @__PURE__ */ h("span", {
						className: "tm-note-glyph",
						"aria-hidden": "true",
						children: bl[n] ?? "·"
					}),
					/* @__PURE__ */ h("span", {
						className: "tm-note-text",
						children: e.text
					}),
					e.at !== null && /* @__PURE__ */ h("span", {
						className: "tm-note-at",
						children: se(e.at)
					})
				]
			}, `${e.kind}-${t}`);
		})
	});
}
function Rl({ rows: e }) {
	if (e.length === 0) return null;
	let t = e.some((e) => e.level === "FAIL") ? "FAIL" : e.some((e) => e.level === "WARN") ? "WARN" : "OK", n = t === "FAIL" ? "bad" : t === "WARN" ? "warn" : "ok";
	return /* @__PURE__ */ g("section", {
		className: `br-card tm-hooks is-${n}`,
		"aria-label": "运行机的 Lean hook",
		"data-testid": "runner-hooks",
		children: [/* @__PURE__ */ g("header", { children: [
			/* @__PURE__ */ h(Y, {
				role: "lint",
				size: 18
			}),
			/* @__PURE__ */ h("h3", { children: "运行机的 Lean hook" }),
			/* @__PURE__ */ h("span", {
				className: `br-chip kt-pill tone-${n}`,
				children: nt[t]
			}),
			/* @__PURE__ */ h("span", {
				className: "br-dim br-small",
				children: "brain-runnerd 每建一个工作区前查一次：hook 适配器第 3 版，brain-run 的三个 hook"
			})
		] }), /* @__PURE__ */ h(xt, { rows: e })]
	});
}
function zl({ rows: e }) {
	let t = [...xl, ...[...new Set(e.map((e) => e.file))].filter((e) => !xl.some((t) => t.file === e)).map((e) => ({
		file: e,
		what: ""
	}))], n = e.filter((e) => !e.default).length;
	return /* @__PURE__ */ g("section", {
		className: "br-card tm-cfg-card",
		"aria-label": "配置",
		children: [/* @__PURE__ */ g("header", { children: [
			/* @__PURE__ */ h(Y, {
				role: "settings",
				size: 18
			}),
			/* @__PURE__ */ h("h3", { children: "配置" }),
			/* @__PURE__ */ h("span", {
				className: "br-dim br-small",
				children: e.length ? `brain-kit 读的设置：改过 ${n} 项，其余用默认` : "brain-kit 读的 bridge.json 和 runnerd.json"
			})
		] }), e.length === 0 ? /* @__PURE__ */ h("p", {
			className: "br-empty",
			children: "还没读到设置：桥开起来以后，这里列出 bridge.json 和 runnerd.json 里 brain-kit 读的每一项。"
		}) : /* @__PURE__ */ h("div", {
			className: "br-scroll",
			children: /* @__PURE__ */ g("table", {
				className: "cto-table tm-cfg",
				children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
					/* @__PURE__ */ h("th", { children: "设置" }),
					/* @__PURE__ */ h("th", { children: "值" }),
					/* @__PURE__ */ h("th", { children: "说明" })
				] }) }), t.map(({ file: t, what: n }) => {
					let r = e.filter((e) => e.file === t);
					return /* @__PURE__ */ g("tbody", {
						"aria-label": t,
						"data-file": t,
						children: [/* @__PURE__ */ h("tr", {
							className: "tm-cfg-file",
							children: /* @__PURE__ */ h("th", {
								colSpan: 3,
								scope: "rowgroup",
								children: /* @__PURE__ */ g("span", {
									className: "br-row",
									children: [
										/* @__PURE__ */ h(Y, {
											role: "file",
											size: 14
										}),
										/* @__PURE__ */ h("code", { children: t }),
										n && /* @__PURE__ */ h("span", {
											className: "br-dim",
											children: n
										})
									]
								})
							})
						}), r.length === 0 ? /* @__PURE__ */ h("tr", { children: /* @__PURE__ */ g("td", {
							colSpan: 3,
							className: "br-dim",
							children: ["没配 ", t]
						}) }) : r.map((e) => /* @__PURE__ */ g("tr", {
							"data-key": e.key,
							className: e.default ? "is-default" : void 0,
							children: [
								/* @__PURE__ */ h("td", {
									className: "tm-cfg-key",
									children: /* @__PURE__ */ h("code", { children: e.key })
								}),
								/* @__PURE__ */ g("td", {
									className: "tm-cfg-val",
									children: [/* @__PURE__ */ h("span", { children: e.value }), e.default && /* @__PURE__ */ h("span", {
										className: "tm-def",
										children: "默认"
									})]
								}),
								/* @__PURE__ */ h("td", {
									className: "tm-cfg-text",
									children: e.text
								})
							]
						}, e.key))]
					}, t);
				})]
			})
		})]
	});
}
var Bl = "\n/* a step's words break only between phrases (回答、| 验收; 每一轮看 MR，| 检查交接), never inside a word */\n.tm-root .br-flow > li { word-break: keep-all; overflow-wrap: anywhere; }\n.tm-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.tm-top-icon { color: var(--accent); }\n.tm-same .kt-role-icon { color: var(--kt-warn); }\n.tm-status { gap: .7em; }\n.tm-status.is-ok { border-color: var(--kit-ok); }\n.tm-status.is-bad { border-color: var(--kit-bad); }\n.tm-status-row { display: flex; align-items: center; gap: .8em 1.2em; flex-wrap: wrap; }\n.tm-status-icon { display: grid; place-items: center; width: 3.2em; height: 3.2em; border-radius: .9em; color: var(--text-strong);\n  border: 1px solid var(--border); background: var(--kt-glass); }\n.tm-status.is-ok .tm-status-icon { color: var(--kt-ok); border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 10%, transparent); }\n.tm-status.is-bad .tm-status-icon { color: var(--kt-bad); border-color: var(--kit-bad); }\n.tm-status-main { display: grid; gap: .3em; }\n.tm-status-main h3 { font-size: 1.25em; }\n.tm-facts { display: flex; gap: .3em 1.4em; flex-wrap: wrap; color: var(--muted); font-size: .93em; }\n.tm-facts b { color: var(--text-strong); font-weight: 650; }\n.tm-loop { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; padding: .5em .8em; border-radius: var(--kit-r-cell, 10px); }\n.tm-loop.is-ok { background: color-mix(in srgb, var(--kt-ok) 9%, transparent); border: 1px solid var(--kit-ok); }\n.tm-loop.is-ok > b { color: var(--kt-ok); }\n.tm-loop.is-bad { background: color-mix(in srgb, var(--kt-bad) 9%, transparent); border: 1px solid var(--kit-bad); }\n.tm-loop.is-bad > b { color: var(--kt-bad); }\n.tm-kpis { grid-template-columns: repeat(5, minmax(0, 1fr)); }\n@container br-app (max-width: 1280px) { .tm-kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } }\n@container br-app (max-width: 760px) { .tm-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.tm-kpi.has-bad { border-color: var(--kit-bad); }\n.tm-kpi.has-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.tm-do { font-size: .93em; color: var(--text); }\n.tm-do b { color: var(--muted); font-weight: 650; margin-right: .5em; }\n.tm-same { display: grid; gap: .3em; }\n.tm-loop-error { display: grid; gap: .3em; }\n.tm-loop-error p { margin: 0; }\n.tm-belt-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 10px; }\n.tm-stack { display: flex; gap: 2px; height: .75em; margin-top: .2em; border-radius: .3em; overflow: hidden; }\n.tm-stack i { flex: 1 1 0; min-width: .4em; background: var(--kt-tone); }\n.tm-stack.is-empty i { background: color-mix(in srgb, var(--muted) 22%, transparent); }\n.tm-legs { display: flex; flex-wrap: wrap; gap: .25em .9em; font-size: .84em; color: var(--text); }\n.tm-leg { display: inline-flex; align-items: center; gap: .4em; white-space: nowrap; }\n.tm-leg i { width: .7em; height: .7em; border-radius: 2px; background: var(--kt-tone); flex: none; }\n.tm-leg b { color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.tm-cells { display: flex; flex-wrap: wrap; gap: 4px; min-height: 1.4em; margin-top: .2em; }\n.tm-cells i { width: 1.4em; height: 1.4em; border-radius: .4em; border: 2px solid var(--kt-c); background: color-mix(in srgb, var(--kt-c) 22%, transparent); }\n.tm-cells i.is-wait { --kt-c: var(--kt-approve); } .tm-cells i.is-bad { --kt-c: var(--kt-bad); } .tm-cells i.is-warn { --kt-c: var(--kt-warn); border-style: dashed; }\n/* the hand-overs wrap onto more rows instead of scrolling (a hidden scrollbar hid the third one) */\n.tm-belt { align-items: stretch; padding-top: .5em; padding-bottom: .5em; flex-wrap: wrap; overflow: visible; }\n.tm-belt::before { display: none; }\n.tm-belt > li { flex: 1 1 15em; min-width: 0; }\n@container br-app (max-width: 760px) { .tm-belt-row { grid-template-columns: minmax(0, 1fr); } .tm-belt-row > .kt-belt-end { justify-self: start; } }\n.tm-belt .kt-belt-chip { gap: .25em; max-width: 26em; padding: .55em .8em .6em; }\n.tm-belt .kt-belt-chip.is-pending { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, var(--card)); }\n.tm-belt .kt-belt-chip.is-seen { border: 1px solid var(--border); background: var(--card); }\n.tm-chip-top { display: flex; align-items: center; gap: .3em .6em; flex-wrap: wrap; }\n.tm-mr { display: inline-flex; align-items: center; gap: .25em; text-decoration: none; }\n.tm-mr:hover { text-decoration: underline; }\n.tm-hint { font-size: .8em; color: var(--text); white-space: normal; line-height: 1.4; }\n.tm-runs td { vertical-align: middle; }\n.tm-state { display: inline-grid; gap: .25em; justify-items: start; }\n.tm-state-hint { font-size: .8em; color: var(--muted); max-width: 22em; white-space: normal; line-height: 1.4; }\n.tm-runs tr.has-notes > td { border-bottom: 0; padding-bottom: .35em; }\n.tm-runs tr.tm-notes-row > td { padding-top: 0; padding-bottom: .8em; }\n.tm-notes { list-style: none; margin: 0; padding: 0; display: grid; gap: .3em; }\n.tm-note { display: flex; align-items: baseline; gap: .55em; padding: .32em .75em; border-radius: var(--kit-r-cell, 10px); font-size: .88em; color: var(--text);\n  border: 1px solid color-mix(in srgb, var(--kt-tone) 40%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 7%, transparent); }\n.tm-note.tone-idle { border-color: var(--border); background: var(--kt-glass); }\n.tm-note-glyph { flex: none; display: inline-grid; place-items: center; width: 1.35em; height: 1.35em; border-radius: .4em; align-self: center;\n  font-weight: 900; font-size: .86em; color: var(--kt-tone); border: 1.5px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }\n.tm-note.tone-idle .tm-note-glyph { border-color: color-mix(in srgb, var(--muted) 50%, transparent); color: var(--muted); background: transparent; }\n.tm-note-text { flex: 1; min-width: 0; color: var(--text-strong); white-space: normal; overflow-wrap: anywhere; }\n.tm-note.tone-idle .tm-note-text { color: var(--text); }\n.tm-note-at { flex: none; color: var(--muted); font-size: .92em; white-space: nowrap; font-variant-numeric: tabular-nums; }\n.tm-cfg th, .tm-cfg td { vertical-align: baseline; }\n.tm-cfg tr.tm-cfg-file > th { padding-top: 1.1em; padding-bottom: .45em; border-bottom: 1px solid var(--border); font-weight: 700; color: var(--text-strong); }\n.tm-cfg tbody:first-of-type tr.tm-cfg-file > th { padding-top: .7em; }\n.tm-cfg tr.tm-cfg-file code { font-size: .95em; color: var(--text-strong); }\n.tm-cfg tr.tm-cfg-file .kt-role-icon { color: var(--muted); }\n.tm-cfg tbody tr:last-child td { border-bottom: 0; }\n.tm-cfg-key code { white-space: nowrap; font-weight: 650; color: var(--text-strong); }\n.tm-cfg-val { min-width: 8em; max-width: 22em; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }\n.tm-cfg-val > span:first-child { font-weight: 650; }\n.tm-cfg tr.is-default .tm-cfg-val > span:first-child { font-weight: 500; color: var(--text); }\n.tm-def { display: inline-flex; margin-left: .55em; padding: 0 .55em; border-radius: 999px; font-size: .78em; font-weight: 650; vertical-align: 1px; white-space: nowrap;\n  color: var(--muted); background: color-mix(in srgb, var(--text) 7%, transparent); }\n.tm-cfg-text { color: var(--text); font-size: .93em; min-width: 18em; }\n.tm-signer { display: grid; grid-template-columns: repeat(auto-fit, minmax(20em, 1fr)); gap: var(--kit-gap-row, 12px); align-items: start; }\n.tm-sig-col { display: grid; gap: .5em; }\n.tm-sig-col h4 { margin: 0; display: flex; align-items: center; gap: .5em; font-size: .93em; color: var(--text-strong); }\n.tm-sigs { list-style: none; margin: 0; padding: 0; display: grid; gap: .5em; }\n.tm-sig { display: grid; gap: .3em; padding: .6em .8em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }\n.tm-sig.is-wait { border-color: var(--kit-wait); }\n.tm-sig.is-bad { border-color: var(--kit-bad); background: color-mix(in srgb, var(--kt-bad) 6%, var(--card)); }\n.tm-sig.is-warn { border-style: dashed; border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n", Vl = {
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
		label: "自动检查"
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
}, Hl = "\n.br-detail { container: br-detail / inline-size; }\n.br-detail .br-detail-head { display: grid; gap: 12px; }\n.br-detail .cto-item-head .kt-run-title { margin: 0; }\n.br-detail .br-now { display: grid; gap: 8px; padding: 12px 16px; border-radius: 14px; border: 1px solid var(--border); background: var(--kt-glass); }\n.br-detail .br-now.is-you { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 7%, var(--card)); }\n.br-detail .br-now-head { display: flex; align-items: baseline; gap: 4px 10px; flex-wrap: wrap; }\n.br-detail .br-now-head .cto-eyebrow { align-self: center; }\n.br-detail .br-now-text { color: var(--text-strong); font-size: 1.08em; font-weight: 700; }\n.br-detail .br-now p { margin: 0; color: var(--text); }\n.br-detail .br-now-say { display: flex; align-items: center; gap: 8px 10px; flex-wrap: wrap; padding: 8px 10px; border-radius: 10px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 55%, var(--border)); background: var(--card); }\n.br-detail .br-now-say code { font-weight: 700; color: var(--text-strong); user-select: all; overflow-wrap: anywhere; flex: 1 1 260px; }\n.br-detail .br-now-act { gap: 8px; }\n.br-detail .br-now-act a.kt-btn { text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }\n.br-detail .br-claimed-text { font-size: 1.7em; font-weight: 800; color: var(--text-strong); line-height: 1.25; margin: 4px 0 0; }\n.br-detail .cto-item-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n.br-detail .cto-item-cards > .cto-card { container-type: inline-size; }\n.br-detail .cto-item-cards .cto-value { white-space: nowrap; font-size: min(2.85em, 14cqi); }\n@container br-detail (max-width: 1180px) { .br-detail .cto-item-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n@container br-detail (max-width: 600px) { .br-detail .cto-item-cards { grid-template-columns: minmax(0, 1fr); } }\n.br-detail .cto-segs i.is-skip { background: repeating-linear-gradient(135deg, color-mix(in srgb, var(--muted) 45%, transparent) 0 2px, transparent 2px 5px); box-shadow: none; }\n.br-detail .cto-segs i.is-next, .br-detail .cto-segs i.is-todo { background: transparent; box-shadow: inset 0 0 0 1.5px var(--border-strong); }\n.br-detail .cto-segs i.is-next { box-shadow: inset 0 0 0 2px var(--accent); }\n.br-detail .cto-segs i.is-run { background: var(--kt-run); }\n.br-detail .cto-segs i.is-wait { background: var(--kt-approve); }\n.br-detail .cto-segs i.is-watch { background: color-mix(in srgb, var(--kt-ok) 45%, transparent); }\n.br-detail .cto-chips button.cto-chip { cursor: pointer; padding: 0; font: inherit; }\n.br-detail .br-twocol { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr); gap: 16px; align-items: start; }\n@container br-detail (max-width: 1100px) { .br-detail .br-twocol { grid-template-columns: minmax(0, 1fr); } }\n.br-detail .br-col { display: grid; gap: 16px; min-width: 0; }\n.br-detail :where(.br-col) > section.cto-card { border-radius: var(--kit-r); border: 1px solid var(--border); background-color: var(--card); padding: var(--kit-pad-block); margin: 0; }\n.br-detail .br-detail-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 5px 22px; margin: 0; padding: 10px 14px;\n  border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }\n.br-detail .br-detail-facts > div { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 8px; align-items: baseline; min-width: 0; }\n.br-detail .br-detail-facts > details { grid-column: 1 / -1; }\n.br-detail .br-detail-facts dt { font-size: .86em; }\n.br-detail .br-detail-facts dd { overflow-wrap: anywhere; }\n.br-detail :is(.br-path > span, .br-nowrap) { white-space: nowrap; }\n.br-detail .br-phrase { display: inline-block; max-width: 100%; }\n.br-detail .br-rawlist { margin: 6px 0 0; display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 12px; }\n.br-detail .br-rawlist dd { margin: 0; overflow-wrap: anywhere; }\n.br-detail .br-stagecells { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 4px; list-style: none; margin: 0; padding: 0; }\n@container br-detail (max-width: 1100px) { .br-detail .br-stagecells { grid-template-columns: repeat(6, minmax(0, 1fr)); } }\n@container br-detail (max-width: 600px) { .br-detail .br-stagecells { grid-template-columns: repeat(3, minmax(0, 1fr)); } }\n.br-detail .br-stagecell { position: relative; display: grid; gap: 2px; align-content: start; padding: 7px 8px 8px; border-radius: 10px; min-height: 64px;\n  border: 2px solid color-mix(in srgb, var(--kt-tone) 70%, var(--border)); background: color-mix(in srgb, var(--kt-tone) 12%, var(--card)); }\n.br-detail .br-stagecell.is-done { background: var(--kt-ok-solid); border-color: color-mix(in srgb, var(--kt-ok) 75%, transparent); }\n.br-detail .br-stagecell.is-done :is(.br-stage-n, .br-stage-label) { color: #fff; }\n.br-detail .br-stagecell.is-done .br-stage-units .br-chip { color: #fff; background: rgba(255, 255, 255, .18); border-color: rgba(255, 255, 255, .4); }\n.br-detail .br-stagecell.is-skipped { border-style: dashed; background: transparent; opacity: .7; }\n.br-detail .br-stagecell.is-todo { border-style: dashed; background: transparent; border-color: var(--border-strong); }\n.br-detail .br-stagecell.is-next { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, transparent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent); }\n.br-detail .br-stagecell.is-next .br-stage-n { color: var(--accent); }\n.br-detail .br-stagecell.is-started { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 25%, transparent), 0 0 18px -6px var(--kt-run); }\n.br-detail .br-stage-n { font-size: .74em; font-weight: 800; color: var(--muted); }\n.br-detail .br-stage-label { font-size: .86em; font-weight: 750; color: var(--text-strong); line-height: 1.25; }\n/* a unit's chip stays inside its tile (its state as a glyph, the words in its title): 11 tiles fit 1280 */\n.br-detail .br-stagecell { grid-template-columns: minmax(0, 1fr); min-width: 0; }\n.br-detail .br-stage-units { display: flex; flex-wrap: wrap; gap: 3px; margin-top: 2px; min-width: 0; }\n.br-detail .br-stage-units .br-chip { display: block; font-size: .7em; padding: 0 6px; max-width: 100%; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n.br-detail .br-lean-sub { margin: 14px 0 6px; }\n.br-detail .br-approvals { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }\n.br-detail .br-approval { display: grid; gap: 6px; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }\n.br-detail .br-approval[data-state=\"pending\"] { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }\n.br-detail .br-approval[data-state=\"approved\"] { border-color: var(--kit-ok); }\n.br-detail .br-approval .br-raw { margin-left: auto; }\n.br-detail .cto-table td { vertical-align: top; }\n.br-detail .br-dec td:last-child { white-space: nowrap; text-align: right; }\n@container br-detail (max-width: 1100px) {\n  .br-detail .br-dec thead { display: none; }\n  .br-detail .br-dec, .br-detail .br-dec tbody { display: block; }\n  .br-detail .br-dec tr { display: grid; grid-template-columns: auto auto minmax(0, 1fr) auto; gap: 2px 12px; align-items: baseline; padding: 9px 12px; margin-bottom: 8px;\n    border: 1px solid var(--border); border-radius: 12px; background: var(--kt-glass); }\n  .br-detail .br-dec td { display: block; border: 0; padding: 0; min-width: 0; }\n  .br-detail .br-dec td.br-key { grid-area: 1 / 1; }\n  .br-detail .br-dec td[data-label=\"阶段\"] { grid-area: 1 / 2; }\n  .br-detail .br-dec td[data-label=\"谁定的\"] { grid-area: 1 / 3; white-space: normal; }\n  .br-detail .br-dec td[data-label=\"决定\"] { grid-area: 2 / 1 / 3 / -1; color: var(--text-strong); }\n  .br-detail .br-dec td[data-label=\"为什么\"] { grid-area: 3 / 1 / 4 / -1; }\n  .br-detail .br-dec td[data-label=\"引用 Brain\"] { grid-area: 4 / 1 / 5 / 4; }\n  .br-detail .br-dec td:last-child { grid-area: 4 / 4; text-align: right; }\n  .br-detail .br-dec td[data-label=\"引用 Brain\"] .br-dim { visibility: hidden; }\n  .br-detail .br-dec td:is([data-label=\"为什么\"], [data-label=\"谁定的\"])::before { content: attr(data-label) '：'; color: var(--muted); font-size: .9em; }\n}\n.br-detail .br-vs { position: relative; margin-top: 10px; }\n.br-detail .br-vs svg { display: block; width: 100%; overflow: visible; }\n.br-detail .br-vs text { font-size: 12px; fill: var(--muted); font-variant-numeric: tabular-nums; }\n.br-detail .br-vs text.is-strong { fill: var(--text-strong); font-weight: 650; font-size: 12.5px; }\n.br-detail .br-vs .br-vs-n circle { fill: var(--text-strong); stroke: var(--card); stroke-width: 1.5; }\n.br-detail .br-vs .br-vs-n text { fill: var(--card); font-size: 10px; font-weight: 800; }\n.br-detail .br-sessions { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }\n.br-detail .br-session { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; gap: 4px 10px; align-items: center; padding: 9px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); }\n.br-detail .br-session .kt-role-icon { color: var(--text-strong); }\n.br-detail .br-tl li { grid-template-columns: 3.4em 22px 1fr; }\n.br-detail .br-tl .kt-role-icon { color: var(--muted); }\n.br-detail .br-tl li[data-kind=\"merge\"] .kt-role-icon, .br-detail .br-tl li[data-kind=\"approval\"] .kt-role-icon, .br-detail .br-tl li[data-kind=\"human\"] .kt-role-icon { color: var(--kt-ok); }\n.br-detail .br-tl li[data-kind=\"blocked\"] .kt-role-icon { color: var(--kt-warn); }\n.br-detail .br-tl li[data-kind=\"handover\"] .kt-role-icon { color: var(--kt-handoff); }\n.br-detail .br-tlbox { max-height: 520px; overflow: auto; }\n.br-detail .br-tl details summary { cursor: pointer; color: var(--muted); }\n.br-detail .br-tlmissing { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border); }\n.br-detail .br-dec td:is(.br-key, [data-label=\"阶段\"], [data-label=\"谁定的\"]) { white-space: nowrap; }\n.br-detail .br-dec tr.is-picked { background: color-mix(in srgb, var(--kt-info) 12%, var(--card)); outline: 2px solid var(--kt-info); outline-offset: -2px; scroll-margin: 80px; }\n";
function Ul(e) {
	return !!e.run?.handoff || [
		"handed_over",
		"running",
		"parked",
		"acceptance"
	].includes(e.row.state);
}
function Wl(e) {
	let t = e.row.lean;
	if (t.done_n !== void 0 && t.skipped_n !== void 0 && t.next !== void 0) return {
		done_n: t.done_n,
		skipped_n: t.skipped_n,
		next: t.next,
		stage: t.stage,
		stage_state: t.stage_state
	};
	let n = e.lean.stages, r = n.find((e) => e.state === "started" || e.state === "todo");
	return {
		done_n: n.filter((e) => e.state === "done").length,
		skipped_n: n.filter((e) => e.state === "skipped").length,
		next: r ? {
			id: r.id,
			label: r.label,
			n: r.n
		} : null,
		stage: r?.id ?? null,
		stage_state: r?.state === "started" ? "started" : null
	};
}
var Gl = (e) => e && Number.isFinite(Date.parse(e)) ? Date.parse(e) / 1e3 : null;
function Kl(e, t) {
	return t?.events.find((e) => e.kind === "start")?.at ?? Gl(e.run?.created_at);
}
function ql(e) {
	let t = e.row.waits;
	if (t.line) return "approve";
	switch (e.row.state) {
		case "claimed": return "start";
		case "acceptance": return "accept";
		case "parked": return "answer";
		case "rejected": return "redo_handoff";
		case "local": return e.sessions.some((e) => e.kind === "local" && e.awaiting) ? "tool" : t.who === "you" ? "reply" : "none";
		default: return "none";
	}
}
function Jl(e, t, n) {
	let r = e.row.waits, i = r.do ?? ql(e), a = Ul(e), o = r.where === void 0 ? i === "start" || i === "write_back" ? "app" : i === "none" || i === "watch" ? null : a ? "mr" : "session" : r.where, s = e.questions.find((e) => ct(e) && e.source !== "park");
	return {
		who: r.who,
		whoSay: Zn(r.who, e.row.owner, t?.person.me ?? !1),
		do: i,
		where: o,
		text: r.text,
		line: r.line,
		since: r.since ?? (i === "start" ? Gl(e.claim?.created_at) : i === "reply" ? n?.last_activity ?? null : null),
		sessionUrl: n?.url ?? null,
		mrUrl: t?.accept.step.mr_url ?? s?.mr_url ?? e.row.mr?.url ?? null,
		question: s?.id ?? null,
		choices: s?.options.length ? `选 ${s.options.map((e) => e.id).join(" / ")}` : "approve / reject",
		how: i === "redo_handoff" && t?.row.waits.do === "redo_handoff" && t.accept.step.text.split("\n").filter((e) => e && !e.startsWith("接手被拒")).join(" ") || null,
		review: i === "reply" ? Yl(e, t) : null
	};
}
function Yl(e, t) {
	let n = e.row.waits;
	if (n.review !== void 0) return n.review ? { say: t?.accept.step.line ?? null } : null;
	let r = e.lean.next[0] ?? "";
	if (!Ca(r)) return Ca(n.text) ? { say: null } : null;
	let i = /说[:：]\s*「([^」]+)」/.exec(r);
	return { say: i ? i[1] : null };
}
function Xl(e, t) {
	let n = [...(t?.events ?? []).filter((e) => e.kind === "reflect").map((e) => e.text), ...e.timeline.items.map((e) => `${e.label} ${e.detail ?? ""}`)];
	for (let e of n) {
		let t = /brain\/[A-Za-z0-9._-]+-reflect-\d+/.exec(e);
		if (t) return t[0];
	}
	return null;
}
function Zl({ entry: e, onBack: t, onSwitch: n, onMissing: r, ...a }) {
	let o = N(E.requirement(e.repo, e.key), a.pollMs ?? 5e3), s = N(o.data ? E.board(e.repo, e.key) : null, a.pollMs ?? 5e3), [l, u] = c(null), d = W[e.from ?? "overview"], f = () => {
		o.reload(), a.reloadStatus();
	}, p = tn(e.repo, e.key, () => {
		f(), s.reload();
	}), m = o.data, _ = s.data, v = !m && o.status === 404, y = Jr(e.repo, e.key, a.status, a.pollMs), b = n ?? ((e, t) => a.go({
		kind: "item",
		repo: e,
		key: t
	}));
	i(() => {
		(v || m) && r?.(v);
	}, [v, !!m]);
	let x = a.status?.repos.find((t) => t.id === e.repo) ?? null, S = m ? m.sessions.find((e) => e.kind === "local" && !e.error) ?? null : null, C = (t = {}) => a.go({
		kind: "board",
		repo: e.repo,
		key: e.key,
		from: "item",
		...t
	}), w = t ? {
		name: d,
		go: t
	} : {
		name: W.overview,
		go: () => a.go({
			kind: "overview",
			...e.repo === "runner" ? {} : { repo: e.repo }
		})
	};
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view cto-root cto-item br-detail",
		"data-testid": "br-detail",
		children: [
			/* @__PURE__ */ h("style", { children: Hl }),
			/* @__PURE__ */ g("div", {
				className: "cto-top",
				children: [
					/* @__PURE__ */ g("nav", {
						className: "kit-crumb",
						"aria-label": "位置",
						children: [
							t ? /* @__PURE__ */ h("button", {
								type: "button",
								onClick: t,
								children: d
							}) : /* @__PURE__ */ h("span", { children: d }),
							/* @__PURE__ */ h("span", {
								"aria-hidden": "true",
								children: "›"
							}),
							/* @__PURE__ */ h("b", { children: e.key })
						]
					}),
					/* @__PURE__ */ h("span", { className: "cto-grow" }),
					/* @__PURE__ */ h(Xr, {
						repo: e.repo,
						reqKey: e.key,
						status: a.status,
						pollMs: a.pollMs,
						onPick: b
					}),
					/* @__PURE__ */ g("div", {
						className: "cto-item-act",
						children: [
							m && /* @__PURE__ */ h("button", {
								type: "button",
								className: "kt-btn is-primary",
								onClick: () => C(),
								children: "需求看板 ↗"
							}),
							m && m.row.state === "merged" && /* @__PURE__ */ h("button", {
								type: "button",
								className: "kt-btn",
								onClick: () => C({ replay: !0 }),
								children: "▶ 回放 ↗"
							}),
							t && /* @__PURE__ */ g("button", {
								type: "button",
								className: "kt-btn",
								onClick: t,
								children: ["← 返回", d]
							})
						]
					})
				]
			}),
			y && /* @__PURE__ */ h(Yr, {
				reqKey: e.key,
				what: "需求详情",
				onOpen: () => b("runner", e.key)
			}),
			v ? !y && /* @__PURE__ */ h(Zr, {
				repoName: x?.name ?? null,
				reqKey: e.key,
				backName: w.name,
				onBack: w.go,
				testId: "detail-missing"
			}) : /* @__PURE__ */ h(zt, {
				loading: o.loading,
				error: o.error,
				has: !!m
			}),
			m && /* @__PURE__ */ h(Ql, {
				x: m,
				board: _,
				live: S,
				entry: e,
				props: a,
				opened: l,
				localOnly: m.row.local_only ?? x?.remote === !1,
				onOpened: (e) => {
					u(e), f();
				},
				after: f,
				toBoard: C,
				family: p
			})
		]
	});
}
function Ql({ x: e, board: t, live: n, entry: r, props: i, opened: a, localOnly: o, onOpened: s, after: c, toBoard: l, family: u }) {
	let d = t?.at ?? Date.now() / 1e3, f = Jl(e, t, n), p = e.row.state !== "claimed" && e.row.state !== "unclaimed" && !(e.row.state === "closed" && !e.run), _ = () => i.go({
		kind: "new",
		repo: r.repo,
		key: r.key,
		title: e.row.title
	}), v = e.row.family && /* @__PURE__ */ h(nn, {
		f: e.row.family,
		repo: r.repo,
		reqKey: r.key,
		ctl: u,
		look: "detail",
		go: i.go
	});
	if (!p) return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("section", {
		className: "br-detail-head",
		"aria-label": "需求",
		children: [
			/* @__PURE__ */ h($l, {
				x: e,
				localOnly: o
			}),
			/* @__PURE__ */ h(nu, {
				x: e,
				now: f,
				at: d,
				onStart: _
			}),
			/* @__PURE__ */ h(tu, {
				x: e,
				start: null,
				localOnly: o
			})
		]
	}), v] });
	let y = e.row.state === "local" && !n, b = (e) => l(e ? { at: Math.round(e) } : {}), x = f.who === "you" ? null : rr.has(f.who) ? f.whoSay : "等人", S = (e) => document.querySelector(`[data-testid="br-detail"] section[aria-label="${e}"]`)?.scrollIntoView?.({
		behavior: "smooth",
		block: "start"
	});
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ g("section", {
			className: "br-detail-head",
			"aria-label": "需求",
			children: [
				/* @__PURE__ */ h($l, {
					x: e,
					localOnly: o
				}),
				/* @__PURE__ */ h(ru, {
					x: e,
					now: f,
					at: d,
					live: n,
					canOpen: y,
					repo: r.repo,
					reqKey: r.key,
					onStart: _,
					onAnswer: () => S("问题和回答"),
					onBrain: () => i.go({
						kind: "brain",
						repo: r.repo,
						reflect: r.key
					})
				}),
				(y || a) && /* @__PURE__ */ h(iu, {
					repo: r.repo,
					reqKey: r.key,
					opened: a,
					onOpened: s
				}),
				/* @__PURE__ */ h(tu, {
					x: e,
					start: Kl(e, t),
					localOnly: o
				})
			]
		}),
		/* @__PURE__ */ h(su, {
			x: e,
			board: t,
			at: d,
			localOnly: o,
			replying: f.do === "reply",
			onBoard: l,
			onSessions: () => S("会话")
		}),
		v,
		/* @__PURE__ */ h(il, {
			board: t,
			at: d,
			onAt: b
		}),
		/* @__PURE__ */ h(mu, {
			x: e,
			sessionUrl: f.sessionUrl,
			mrUrl: f.mrUrl,
			waiter: x
		}),
		/* @__PURE__ */ h(yu, {
			decisions: e.decisions,
			stages: e.lean.stages,
			repo: r.repo,
			owner: e.row.owner,
			me: t?.person.me ?? !1,
			go: i.go,
			onAt: b,
			picked: r.decision ?? null
		}),
		/* @__PURE__ */ g("div", {
			className: "br-twocol",
			children: [/* @__PURE__ */ g("div", {
				className: "br-col",
				children: [/* @__PURE__ */ h(bu, {
					x: e,
					repo: r.repo,
					reqKey: r.key,
					onAnswered: c,
					waiter: x
				}), /* @__PURE__ */ h(zr, { m: e.mr_desc })]
			}), /* @__PURE__ */ g("div", {
				className: "br-col",
				children: [
					/* @__PURE__ */ h(xu, { x: e }),
					/* @__PURE__ */ h(Eu, {
						sessions: e.sessions,
						total: e.credits.total,
						note: e.credits.note,
						replying: f.do === "reply",
						at: d
					}),
					/* @__PURE__ */ h(Du, {
						x: e,
						board: t,
						repo: r.repo,
						reqKey: r.key,
						go: i.go
					}),
					/* @__PURE__ */ h(Nu, {
						x: e,
						showMissing: Ul(e) && !o,
						me: t?.person.me ?? !1
					})
				]
			})]
		})
	] });
}
function $l({ x: e, localOnly: t }) {
	let n = e.row;
	return /* @__PURE__ */ g("header", {
		className: "cto-item-head",
		children: [
			/* @__PURE__ */ h("h2", {
				className: "kt-run-title",
				children: n.title
			}),
			/* @__PURE__ */ h("span", {
				className: "kt-pill tone-info kt-mono",
				children: n.key
			}),
			/* @__PURE__ */ h(et, {
				state: n.state,
				label: n.state_label,
				who: n.waits.who
			}),
			t && /* @__PURE__ */ h("span", {
				className: "kt-pill tone-idle",
				"data-testid": "detail-local-only",
				title: "这个仓库没有远端：不交给运行机，没有 MR，在本机做完、在本机合并",
				children: "这个仓库只在本机做"
			}),
			/* @__PURE__ */ g("span", {
				className: "cto-org",
				children: [n.owner ? `${n.owner} 的需求 · ` : "", Ue[n.where] ?? e.where_label]
			})
		]
	});
}
function eu({ path: e }) {
	return /* @__PURE__ */ h("code", {
		className: "br-path",
		title: e,
		children: yr(e).map((e, t) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("span", { children: e }), /* @__PURE__ */ h("wbr", {})] }, t))
	});
}
function tu({ x: e, start: t, localOnly: n }) {
	let r = e.row, i = e.run, a = [
		["Lean 记录的名字", r.intent],
		["Brain 提交", i?.brain_commit],
		["材料包", i?.materials.join("、")],
		["运行机的运行", r.run_ids.join("、")],
		["认领分支", r.where === "claim" ? `claim/${r.key}` : null],
		["来源", e.claim?.source]
	].filter((e) => !!e[1]);
	return /* @__PURE__ */ g("dl", {
		className: "br-detail-facts",
		"aria-label": "基本信息",
		children: [
			r.branch && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "分支" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h(eu, { path: r.branch }) })] }),
			r.worktree && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "工作目录" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h(eu, { path: r.worktree }) })] }),
			r.intent && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "Lean 记录" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h(eu, { path: `aidlc-docs/${r.intent}/` }) })] }),
			r.where !== "claim" && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "MR" }), /* @__PURE__ */ h("dd", { children: r.mr ? /* @__PURE__ */ h(ft, { mr: r.mr }) : n ? "这个仓库只在本机做，没有 MR" : "还没有：交接时开" })] }),
			e.claim && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "认领" }), /* @__PURE__ */ g("dd", { children: [
				e.claim.owner ?? "—",
				" · ",
				q(e.claim.created_at),
				e.claim.source && /* @__PURE__ */ g(m, { children: [" · ", /* @__PURE__ */ g("span", {
					className: "br-nowrap",
					children: ["来自", Ie(e.claim.source)]
				})] }),
				e.claim.closed ? ` · 已关闭：${e.claim.closed}` : ""
			] })] }),
			i && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "开工" }), /* @__PURE__ */ g("dd", { children: [
				t ? de(t) : q(i.created_at),
				i.origin && /* @__PURE__ */ g(m, { children: [" · ", /* @__PURE__ */ h("span", {
					className: "br-nowrap",
					children: i.origin === "local" ? "在本机开工" : `来自${Ie(i.origin)}`
				})] }),
				i.brain_commit && /* @__PURE__ */ g(m, { children: [" · ", /* @__PURE__ */ g("span", {
					className: "br-nowrap",
					children: ["Brain 版本 ", /* @__PURE__ */ h("code", {
						title: i.brain_commit,
						children: i.brain_commit.slice(0, 8)
					})]
				})] })
			] })] }),
			i?.handoff && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "交接" }), /* @__PURE__ */ g("dd", { children: [q(i.handoff.requested_at), i.handoff.by ? ` · ${i.handoff.by}` : ""] })] }),
			i && i.materials.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "带进来的文档" }), /* @__PURE__ */ g("dd", { children: [i.materials.length, " 份"] })] }),
			r.run_ids.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "运行机" }), /* @__PURE__ */ g("dd", { children: [
				"跑了 ",
				r.run_ids.length,
				" 次"
			] })] }),
			r.expected_paths.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "要改的地方" }), /* @__PURE__ */ h("dd", {
				className: "br-row",
				children: r.expected_paths.map((e) => /* @__PURE__ */ h("code", { children: e }, e))
			})] }),
			r.overlap.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "重叠" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ g("span", {
				className: "br-chip tone-warn",
				children: [
					"和 ",
					r.overlap.join("、"),
					" 改同一块"
				]
			}) })] }),
			a.length > 0 && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("dl", {
					className: "br-rawlist",
					children: a.map(([e, t]) => /* @__PURE__ */ g("div", {
						style: { display: "contents" },
						children: [/* @__PURE__ */ h("dt", { children: e }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("code", { children: /* @__PURE__ */ h(xr, { text: t }) }) })]
					}, e))
				})]
			})
		]
	});
}
function nu({ x: e, now: t, at: n, onStart: r }) {
	let i = e.row.family?.role === "child" ? e.row.family : null, a = t.who === "you" || !!i?.acts.release, o = i?.owner ?? e.row.owner ?? e.claim?.owner ?? "认领的人", s = t.since ? G(n - t.since) : null;
	return i && e.row.state !== "closed" && (i.state === "unclaimed" || !i.owner) ? /* @__PURE__ */ g("section", {
		className: "cto-card br-now",
		"aria-label": "此刻",
		"data-testid": "detail-waits",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "此刻"
			}),
			/* @__PURE__ */ g("p", {
				className: "br-claimed-text",
				children: [
					Ne.unclaimed,
					"，谁都能",
					Q.claim
				]
			}),
			/* @__PURE__ */ g("p", {
				className: "cto-desc",
				children: [
					i.parent,
					" 的小需求",
					i.unit ? `，单元 ${i.unit}` : "",
					"。",
					Q.claim,
					"、",
					Z.start,
					"都在下面「",
					i.parent,
					" 的小需求」里。"
				]
			})
		]
	}) : e.row.state === "closed" ? /* @__PURE__ */ g("section", {
		className: "cto-card br-now",
		"aria-label": "此刻",
		"data-testid": "detail-waits",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "此刻"
			}),
			/* @__PURE__ */ h("p", {
				className: "br-claimed-text",
				children: "认领已经关了，没有开工"
			}),
			e.claim?.closed && /* @__PURE__ */ h("p", {
				className: "cto-desc",
				children: e.claim.closed
			})
		]
	}) : /* @__PURE__ */ g("section", {
		className: `cto-card br-now${a ? " is-you" : ""}`,
		"aria-label": "此刻",
		"data-testid": "detail-waits",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "此刻"
			}),
			/* @__PURE__ */ h("p", {
				className: "br-claimed-text",
				children: a ? `认领了${s ? ` ${s}` : ""}，还没开工` : `等 ${o} 开工`
			}),
			/* @__PURE__ */ h("p", {
				className: "cto-desc",
				children: a ? "开工会在这台机器上建它的工作目录和分支，再开一个 brain-dev 会话。还没开工，所以没有周期、时间、成本、检查和记录。" : `${o} 认领了${s ? ` ${s}` : ""}，还没开工。开工以后，这里有周期、时间、成本、检查和 Lean 的 11 个阶段。`
			}),
			a && i && /* @__PURE__ */ g("p", {
				className: "br-hint",
				children: [
					Z.start,
					"在下面「",
					i.parent,
					" 的小需求」里：从大需求的分支开"
				]
			}),
			a && !i && /* @__PURE__ */ g("div", {
				className: "br-row br-now-act",
				children: [/* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn is-primary",
					onClick: r,
					children: X.start
				}), /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: "在「开需求」里开工，需求号和标题已经带过去了"
				})]
			})
		]
	});
}
function ru({ x: e, now: t, at: n, live: r, canOpen: i, repo: a, reqKey: o, onStart: s, onAnswer: c, onBrain: l }) {
	let u = f(), d = Rr(t.line ?? ""), p = t.review, _ = t.who === "you", v = ![
		"agent",
		"runner",
		"bridge",
		"nobody"
	].includes(t.who), y = v && t.since ? G(n - t.since) : null, b = t.where === "mr", x = t.do === "accept" ? "验收" : "回答", S = (e = Z.openSession) => t.sessionUrl && !i ? /* @__PURE__ */ g("button", {
		type: "button",
		className: `kt-btn${b ? "" : " is-primary"}`,
		onClick: () => u(t.sessionUrl),
		children: [/* @__PURE__ */ h($, {
			name: "MessageSquare",
			size: 13
		}), e]
	}) : null, C = S(), w = t.mrUrl && /^https?:\/\//i.test(t.mrUrl) ? /* @__PURE__ */ g("a", {
		className: `kt-btn${_ ? " is-primary" : ""}`,
		href: t.mrUrl,
		target: "_blank",
		rel: "noopener noreferrer",
		children: [
			_ ? `${t.do === "accept" ? Z.acceptOnMr : Z.answerOnMr}${t.question ? ` ${t.question}` : ""}` : Z.viewMr,
			" ",
			/* @__PURE__ */ h($, {
				name: "ExternalLink",
				size: 12
			})
		]
	}) : null, T = null, E = null;
	switch (t.do) {
		case "approve":
		case "accept":
		case "answer":
			b ? (T = _ ? /* @__PURE__ */ g("p", { children: [
				t.do === "answer" ? "问题已经发到 MR 上了" : "交接以后，批准在 MR 上回答",
				t.question ? `：回答 ${t.question}` : "",
				"（",
				t.choices,
				"）。"
			] }) : /* @__PURE__ */ g("p", { children: [
				gr(t.whoSay, `在 MR 上${x}${t.question ? ` ${t.question}` : ""}`),
				"，你不用做什么；",
				x,
				"以后运行机接着做。"
			] }), E = w) : t.line ? (T = /* @__PURE__ */ g("div", {
				className: "br-now-say",
				"data-testid": "now-line",
				children: [
					/* @__PURE__ */ h("code", { children: t.line }),
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "kt-btn is-small is-primary",
						onClick: () => void d.copy(),
						children: [/* @__PURE__ */ h($, {
							name: "Copy",
							size: 13
						}), Z.copyLine]
					}),
					d.copied === "ok" && /* @__PURE__ */ h("span", {
						className: "br-small br-ok-text",
						role: "status",
						children: "已复制"
					}),
					d.copied === "fail" && /* @__PURE__ */ h("span", {
						className: "br-small br-bad-text",
						role: "status",
						children: "没复制成：请手动选中这一行"
					})
				]
			}), E = /* @__PURE__ */ g(m, { children: [C, /* @__PURE__ */ h("span", {
				className: "br-hint",
				children: mt
			})] })) : E = /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("button", {
				type: "button",
				className: "kt-btn is-primary",
				onClick: c,
				children: [X.answer, " ↓"]
			}), C] });
			break;
		case "reply":
			p ? (T = /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("p", { children: [
				"Lean 的下一步是审查：写代码的会话不能自己审，要开一个新会话来审。",
				wa,
				"。"
			] }), p.say && /* @__PURE__ */ h(Br, { say: p.say })] }), E = /* @__PURE__ */ h(Vr, {
				repo: a,
				reqKey: o,
				liveSlot: r?.slot ?? null,
				worktree: e.row.worktree
			})) : (T = e.lean.next[0] ? /* @__PURE__ */ g("p", { children: ["Lean 记下的下一步：", /* @__PURE__ */ h(Cr, { text: e.lean.next[0] })] }) : null, E = S(X.reply));
			break;
		case "tool":
		case "redo_handoff":
			T = /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ g("p", { children: ["做什么：", t.do === "tool" ? "在会话里批准这个工具调用。" : t.how ?? `${X.redo_handoff}（在会话里改，再交接一次）。`] }), e.row.waits.raw && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.row.waits.raw })]
			})] }), E = S(t.do === "tool" ? X.tool : Z.openSession);
			break;
		case "label_handoff":
			T = /* @__PURE__ */ g("p", { children: [
				"做什么：",
				X.label_handoff,
				"（在 MR 上加交接标签）。"
			] }), E = t.mrUrl ? /* @__PURE__ */ g("a", {
				className: "kt-btn is-primary",
				href: t.mrUrl,
				target: "_blank",
				rel: "noopener noreferrer",
				children: [
					X.label_handoff,
					" ",
					/* @__PURE__ */ h($, {
						name: "ExternalLink",
						size: 12
					})
				]
			}) : null;
			break;
		case "start":
			E = _ ? /* @__PURE__ */ h("button", {
				type: "button",
				className: "kt-btn is-primary",
				onClick: s,
				children: X.start
			}) : null;
			break;
		case "write_back": E = /* @__PURE__ */ g("button", {
			type: "button",
			className: "kt-btn is-primary",
			onClick: l,
			children: [Z.writeBack, " ↗"]
		});
	}
	return /* @__PURE__ */ g("section", {
		className: `br-now${_ ? " is-you" : ""}`,
		"aria-label": "此刻",
		"data-testid": "detail-waits",
		"data-do": t.do,
		children: [
			/* @__PURE__ */ g("div", {
				className: "br-now-head",
				children: [
					/* @__PURE__ */ h("span", {
						className: "cto-eyebrow",
						children: "此刻"
					}),
					v && /* @__PURE__ */ h("span", {
						className: `br-chip tone-${_ ? "wait" : "idle"}`,
						children: t.whoSay
					}),
					/* @__PURE__ */ h("span", {
						className: "br-now-text",
						children: t.text || "—"
					}),
					y && /* @__PURE__ */ g("span", {
						className: "br-dim",
						children: ["已等 ", y]
					})
				]
			}),
			T,
			E && /* @__PURE__ */ h("div", {
				className: "br-row br-now-act",
				children: E
			})
		]
	});
}
function iu({ repo: e, reqKey: t, opened: n, onOpened: r }) {
	let i = u(), a = f(), [o, s] = c(!0), [l, d] = c(!0), p = P((n) => i.post(E.session(e, t), n)), _ = async () => {
		let e = await p.run({
			trust: o,
			kickoff: l
		});
		e && r(e);
	};
	return /* @__PURE__ */ g("section", {
		className: "cto-card is-wait br-opensession",
		"aria-label": "开会话",
		children: [n ? /* @__PURE__ */ g("div", {
			className: "br-row",
			children: [/* @__PURE__ */ h("span", {
				className: "br-ok-text",
				children: "会话开好了。"
			}), /* @__PURE__ */ g("button", {
				type: "button",
				className: "kt-btn is-primary",
				onClick: () => a(n.url),
				children: [/* @__PURE__ */ h($, {
					name: "MessageSquare",
					size: 13
				}), Z.openSession]
			})]
		}) : /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ h("h3", { children: "还没有会话" }), /* @__PURE__ */ h("span", {
				className: "cto-dim",
				children: "在这个需求的工作目录里开一个 brain-dev 会话，接着做。"
			})]
		}), /* @__PURE__ */ g("div", {
			className: "br-row",
			children: [
				/* @__PURE__ */ g("label", {
					className: "br-check",
					children: [/* @__PURE__ */ h("input", {
						type: "checkbox",
						checked: o,
						onChange: (e) => s(e.target.checked)
					}), /* @__PURE__ */ h("span", { children: "这个会话的工具调用不用逐个批准" })]
				}),
				/* @__PURE__ */ g("label", {
					className: "br-check",
					children: [/* @__PURE__ */ h("input", {
						type: "checkbox",
						checked: l,
						onChange: (e) => d(e.target.checked)
					}), /* @__PURE__ */ h("span", { children: "开好后先发一句开场，让它接着做" })]
				}),
				/* @__PURE__ */ h("span", { className: "br-grow" }),
				/* @__PURE__ */ h("button", {
					type: "button",
					className: "kt-btn is-primary",
					disabled: p.busy,
					onClick: () => void _(),
					children: p.busy ? "正在开…" : "开会话"
				})
			]
		})] }), p.error && /* @__PURE__ */ h("p", {
			className: "br-error",
			role: "alert",
			children: p.error
		})]
	});
}
function au(e) {
	return e.todo ? mr(e) : e.cells.filter((e) => e.status === "skip" && e.group === "gate").map((e) => e.name.replace(/（[^）]*）$/, ""));
}
var ou = (e) => e.name.replace(/（[^）]*）$/, "");
function su({ x: e, board: t, at: n, localOnly: r, replying: i, onBoard: a, onSessions: o }) {
	let s = Kl(e, t), c = t?.ended_at ?? null, l = Wl(e), u = t ? Yc(t, n) : [], d = Xc(u), f = d.filter((e) => e.p !== "person").reduce((e, t) => e + t.s, 0), p = u.filter((e) => e.part === "person"), m = t ? t.events.filter((e) => e.kind === "reject" || e.kind === "rejected").length : 0, _ = t ? t.events.filter((e) => e.kind === "blocked").length : 0, v = (e) => e === "person" && p[0] ? a({ at: Math.round(p[0].from) }) : a({ focus: "lanes" });
	return /* @__PURE__ */ g("section", {
		className: "cto-cards cto-item-cards",
		"aria-label": "这个需求的四个数",
		children: [
			/* @__PURE__ */ g("article", {
				className: "cto-card",
				"aria-label": "周期",
				children: [
					/* @__PURE__ */ h("div", {
						className: "cto-eyebrow",
						children: "周期"
					}),
					/* @__PURE__ */ h("div", {
						className: "cto-value",
						"data-testid": "item-cycle",
						children: s ? G((c ?? n) - s) : "—"
					}),
					/* @__PURE__ */ g("div", {
						className: "cto-desc",
						children: [s ? `${de(s)} 开工` : "开工时间没记下", c ? ` → ${de(c)} 合并` : " → 进行中"]
					}),
					/* @__PURE__ */ h("div", {
						className: "kt-segs cto-segs",
						role: "img",
						"aria-label": `Lean：${Re(l)}`,
						children: e.lean.stages.map((e) => /* @__PURE__ */ h("i", {
							title: `${e.n} ${e.label} · ${l.next?.n === e.n && e.state === "todo" ? "下一步" : at[e.state]?.label ?? e.state}`,
							className: e.state === "done" ? "is-pass" : e.state === "skipped" ? "is-skip" : e.state === "started" ? "is-run" : l.next?.n === e.n ? "is-next" : "is-todo"
						}, e.id))
					}),
					/* @__PURE__ */ h("div", {
						className: "cto-legend",
						children: /* @__PURE__ */ g("span", {
							"data-testid": "lean-progress",
							children: ["Lean ", Re(l)]
						})
					})
				]
			}),
			/* @__PURE__ */ g("article", {
				className: "cto-card",
				"aria-label": "时间花在哪",
				children: [
					/* @__PURE__ */ h("div", {
						className: "cto-eyebrow",
						children: "时间花在哪"
					}),
					/* @__PURE__ */ h("div", {
						className: "cto-value",
						children: t ? G(f) : "—"
					}),
					/* @__PURE__ */ h("div", {
						className: "cto-desc",
						children: t ? `AI 在做 · 等人 ${G(d.find((e) => e.p === "person").s)}${p.length ? `（${p.length} 段）` : ""}` : "看板的数据还没来"
					}),
					t && /* @__PURE__ */ h(pu, { split: d }),
					t && /* @__PURE__ */ h("div", {
						className: "cto-legend",
						children: d.filter((e) => e.s > 0).map(({ p: e, s: t }) => /* @__PURE__ */ g("button", {
							type: "button",
							onClick: () => v(e),
							title: e === "person" ? "到看板上第一次等人的那一刻" : "在需求看板的泳道上看",
							children: [
								/* @__PURE__ */ h("i", {
									className: "cto-sw",
									style: { background: Vc[e] }
								}),
								Bc[e],
								/* @__PURE__ */ h("b", { children: G(t) })
							]
						}, e))
					})
				]
			}),
			/* @__PURE__ */ h(uu, {
				x: e,
				replying: i,
				me: t?.person.me ?? !1,
				onSessions: o
			}),
			/* @__PURE__ */ h(du, {
				board: t,
				localOnly: r,
				sent: m,
				blocked: _,
				onBoard: a
			})
		]
	});
}
var cu = {
	bad: {
		cls: " is-back",
		label: "出错",
		sw: "var(--vs-rework)"
	},
	wait: {
		cls: " is-wait",
		label: "等人",
		sw: "var(--vs-person)"
	},
	run: {
		cls: "",
		label: "在做",
		sw: "var(--kt-ok-solid)"
	},
	idle: {
		cls: " is-idle",
		label: "空着",
		sw: "var(--border-strong)"
	}
};
function lu(e, t, n) {
	return e.kind === "local" ? je("you") : Zn(t.row.waits.who, t.row.owner, n);
}
function uu({ x: e, replying: t, me: n, onSessions: r }) {
	let i = e.sessions, a = [...new Map(i.map((r) => {
		let { tone: i } = wu(r, t), a = i === "wait" ? lu(r, e, n) : cu[i].label;
		return [a, {
			label: a,
			sw: cu[i].sw
		}];
	})).values()];
	return /* @__PURE__ */ g("article", {
		className: "cto-card",
		"aria-label": "成本",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "成本"
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-value",
				children: e.credits.total === null ? /* @__PURE__ */ h("span", {
					className: "cto-of",
					style: { marginLeft: 0 },
					children: "还没有"
				}) : /* @__PURE__ */ g(m, { children: [ce(e.credits.total), /* @__PURE__ */ h("span", {
					className: "cto-of",
					children: "credits"
				})] })
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-desc",
				children: i.length ? `${i.length} 个会话` : e.credits.total === null ? "还没开过会话" : Tu
			}),
			i.length > 0 && /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ h("div", {
					className: "cto-chips",
					"aria-label": "会话的用量",
					children: i.map((e) => {
						let n = wu(e, t);
						return /* @__PURE__ */ h("button", {
							type: "button",
							className: `cto-chip${cu[n.tone].cls}`,
							title: `${Cu(e)} · ${n.label} · ${ce(e.credits)} credits`,
							onClick: r,
							children: /* @__PURE__ */ h(Y, {
								role: e.kind === "runner" ? "runner" : "laptop",
								size: 16
							})
						}, e.slot);
					})
				}),
				/* @__PURE__ */ h("div", {
					className: "cto-legend",
					children: a.map((e) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("i", {
						className: "cto-dot",
						style: { background: e.sw }
					}), e.label] }, e.label))
				}),
				/* @__PURE__ */ h("div", {
					className: "cto-foot",
					children: /* @__PURE__ */ h("button", {
						type: "button",
						className: "cto-link",
						onClick: r,
						children: "看每个会话的用量 ↓"
					})
				})
			] })
		]
	});
}
function du({ board: e, localOnly: t, sent: n, blocked: r, onBoard: i }) {
	let a = e?.checks, o = a && {
		...a,
		cells: a.cells.map((e) => e.group === "after" && e.status === "wait" ? {
			...e,
			status: "watch"
		} : e)
	}, s = o ? au(o) : [], c = o ? o.cells.filter((e) => e.status === "fail").map(ou) : [], l = o ? o.cells.filter((e) => e.status === "wait").map(ou) : [], u = o ? o.cells.filter((e) => e.status === "watch").map(ou) : [], d = o ? o.cells.filter((e) => e.status !== "not_needed" && e.status !== "skip" && !(t && e.group === "handover")) : [], f = o ? o.cells.filter((e) => e.status === "skip" && s.includes(ou(e))) : [], p = [...new Set([...d, ...f].map((e) => Ge[e.group] ?? e.group))], _ = !!o && o.total > 0 && o.passed === o.total && !s.length && !l.length, v = o ? o.total === 0 && !s.length ? "还没有检查结果" : [
		c.length ? `没过：${c.join("、")}` : `目前 ${o.passed === 1 ? "1 项过了" : `${o.passed} 项都过`}`,
		l.length ? `${e && rr.has(e.row.waits.who) ? Qn(e) : "等人"}：${l.join("、")}` : "",
		u.length ? `观察中：${u.join("、")}` : "",
		s.length ? `还剩 ${s.join("、")}` : ""
	].filter(Boolean).join(" · ") : "看板的数据还没来";
	return /* @__PURE__ */ g("article", {
		className: `cto-card${o && o.total ? o.failed ? " is-bad" : _ ? " is-ok" : "" : ""}`,
		"aria-label": "检查",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "检查"
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-value",
				children: o && o.total ? /* @__PURE__ */ g(m, { children: [o.passed, /* @__PURE__ */ g("span", {
					className: "cto-of",
					children: ["/", o.total]
				})] }) : o ? /* @__PURE__ */ h("span", {
					className: "cto-of",
					style: { marginLeft: 0 },
					children: "还没有"
				}) : "—"
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-desc",
				"data-testid": "checks-say",
				children: /* @__PURE__ */ h(fu, { text: v })
			}),
			o && d.length + f.length > 0 && /* @__PURE__ */ h("button", {
				type: "button",
				className: "kt-segs cto-segs",
				"aria-label": "在需求看板的检查墙上看每一项",
				onClick: () => i({ focus: "checks" }),
				children: [...d, ...f].map((e) => /* @__PURE__ */ h("i", {
					title: `${ou(e)}：${e.detail}`,
					className: e.status === "pass" ? "is-pass" : e.status === "fail" ? "is-fail" : e.status === "wait" ? "is-wait" : e.status === "watch" ? "is-watch" : "is-todo"
				}, e.id))
			}),
			p.length > 0 && /* @__PURE__ */ h("div", {
				className: "cto-legend",
				children: /* @__PURE__ */ g("span", {
					className: "cto-dim",
					children: ["查的是：", p.join(" · ")]
				})
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-legend",
				children: /* @__PURE__ */ g("span", { children: [
					/* @__PURE__ */ h(Y, {
						role: "bounce",
						size: 14
					}),
					"退回 ",
					n,
					" 次 · Lean 拦下 ",
					r,
					" 次"
				] })
			})
		]
	});
}
function fu({ text: e }) {
	let t = e.match(/.+?(?:、|：| · |$)/g) ?? [];
	return /* @__PURE__ */ h(m, { children: t.map((e, t) => /* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("span", {
		className: "br-phrase",
		children: e.endsWith(" · ") ? e.slice(0, -1) : e
	}), e.endsWith(" · ") ? " " : ""] }, t)) });
}
function pu({ split: e }) {
	let t = e.filter((e) => e.s > 0), n = t.reduce((e, t) => e + t.s, 0) || 1;
	return /* @__PURE__ */ h(Dc, {
		label: "时间花在哪：" + t.map((e) => `${Bc[e.p]} ${G(e.s)}`).join("，"),
		height: 22,
		children: (e, r) => {
			let i = Math.max(10, e - 8), a = 0;
			return t.map((e, o) => {
				let s = Math.max(2, e.s / n * i - (o < t.length - 1 ? 2 : 0)), c = a;
				return a += e.s / n * i, /* @__PURE__ */ g("g", { children: [/* @__PURE__ */ h("rect", {
					x: c,
					y: 4,
					width: s,
					height: 14,
					rx: o === t.length - 1 ? 4 : 0,
					fill: Vc[e.p]
				}), /* @__PURE__ */ h(Tc, {
					x: c,
					y: 0,
					w: Math.max(8, s),
					h: 22,
					onTip: r,
					rows: [[
						G(e.s),
						Bc[e.p],
						Vc[e.p]
					], [`${Math.round(e.s / n * 100)}%`, "占记下的时间"]]
				})] }, e.p);
			});
		}
	});
}
function mu({ x: e, sessionUrl: t, mrUrl: n, waiter: r }) {
	let { stages: i, approvals: a } = e.lean, o = Wl(e), s = Ul(e), c = f();
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "Lean 进度",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "AI-DLC Lean" }), /* @__PURE__ */ g("span", {
					className: "cto-dim",
					children: [
						Re(o),
						" · ",
						s ? "交接以后，审批在 MR 上回答" : "审批的那一行由你在会话里自己打，app 不替你发"
					]
				})]
			}),
			/* @__PURE__ */ h("ol", {
				className: "br-stagecells",
				"aria-label": "11 个阶段",
				children: i.map((e) => /* @__PURE__ */ h(gu, {
					s: e,
					next: o.next?.n === e.n && e.state === "todo"
				}, e.id))
			}),
			/* @__PURE__ */ h("h3", {
				className: "br-lean-sub",
				children: "审批"
			}),
			a.length === 0 ? /* @__PURE__ */ h("p", {
				className: "br-empty",
				children: "还没有审批。"
			}) : /* @__PURE__ */ h("ul", {
				className: "br-approvals",
				"aria-label": "审批",
				children: a.map((i, a) => {
					let o = it[i.state] ?? {
						label: i.state,
						tone: "idle"
					}, l = e.questions.find((e) => e.lean_request?.startsWith(i.kind) && e.source !== "park"), u = l?.mr_url ?? n, d = /\/([^/]+)-code-generation-plan\.md$/.exec(i.path ?? "")?.[1], f = l?.kind === "acceptance";
					return /* @__PURE__ */ g("li", {
						className: "br-approval",
						"data-testid": "approval",
						"data-state": i.state,
						children: [/* @__PURE__ */ g("div", {
							className: "br-row",
							children: [
								/* @__PURE__ */ h(Y, {
									role: i.kind === "RELEASE" ? "release" : i.kind === "REQUIREMENTS" ? "req" : "design",
									size: 16
								}),
								/* @__PURE__ */ g("b", { children: [ke(i.kind), d ? ` · ${d}` : ""] }),
								/* @__PURE__ */ h("span", {
									className: `br-chip tone-${o.tone}`,
									children: i.state === "pending" && s ? "在 MR 上等回答" : o.label
								}),
								i.at !== null && /* @__PURE__ */ h("span", {
									className: "br-dim br-small",
									children: de(i.at)
								}),
								/* @__PURE__ */ g("details", {
									className: "br-raw",
									children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("code", { children: /* @__PURE__ */ h(xr, { text: [
										i.kind,
										i.sha8,
										i.path
									].filter(Boolean).join(" · ") }) })]
								})
							]
						}), i.state === "pending" && (s ? /* @__PURE__ */ g("p", {
							className: "br-note",
							children: [
								gr(r ?? "", `在 MR 上${f ? "验收" : "回答"}${l?.id ? ` ${l.id}` : ""}`),
								"（approve / reject），",
								r ? "你不用做什么" : "这里不能回答",
								"。",
								u && /^https?:\/\//i.test(u) && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ g("a", {
									className: "br-link",
									href: u,
									target: "_blank",
									rel: "noopener noreferrer",
									children: [
										r ? Z.viewMr : f ? Z.acceptOnMr : Z.answerOnMr,
										" ",
										/* @__PURE__ */ h($, {
											name: "ExternalLink",
											size: 12
										})
									]
								})] })
							]
						}) : i.line && /* @__PURE__ */ h(hu, {
							line: i.line,
							sessionUrl: t,
							onOpen: (e) => c(e)
						}))]
					}, `${i.kind}-${i.sha8 ?? a}`);
				})
			})
		]
	});
}
function hu({ line: e, sessionUrl: t, onOpen: n }) {
	let { copied: r, copy: i } = Rr(e);
	return /* @__PURE__ */ g("div", {
		className: "br-line",
		"data-testid": "type-line",
		children: [
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => void i(),
						children: [/* @__PURE__ */ h($, {
							name: "Copy",
							size: 13
						}), Z.copyLine]
					}),
					t && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						onClick: () => n(t),
						children: [/* @__PURE__ */ h($, {
							name: "MessageSquare",
							size: 13
						}), Z.openSession]
					}),
					r === "ok" && /* @__PURE__ */ h("span", {
						className: "br-small br-ok-text",
						role: "status",
						children: "已复制"
					}),
					r === "fail" && /* @__PURE__ */ h("span", {
						className: "br-small br-bad-text",
						role: "status",
						children: "没复制成：请手动选中这一行"
					})
				]
			}),
			/* @__PURE__ */ h("p", { children: mt })
		]
	});
}
function gu({ s: e, next: t }) {
	let n = at[e.state] ?? at.todo, r = t ? "下一步" : n.label;
	return /* @__PURE__ */ g("li", {
		className: `br-stagecell is-${e.state}${t ? " is-next" : ""} tone-${n.tone === "wait" ? "approve" : n.tone}`,
		"data-testid": "stage",
		"data-state": e.state,
		title: e.note ?? r,
		children: [
			/* @__PURE__ */ g("span", {
				className: "br-stage-n",
				children: [
					e.n,
					" · ",
					r
				]
			}),
			/* @__PURE__ */ g("span", {
				className: "br-stage-label",
				children: [e.label, /* @__PURE__ */ g("span", {
					className: "br-sr",
					children: [
						"（",
						r,
						"）"
					]
				})]
			}),
			e.units.length > 0 && /* @__PURE__ */ h("span", {
				className: "br-stage-units",
				children: e.units.map((e) => {
					let t = at[e.state] ?? at.todo;
					return /* @__PURE__ */ g("span", {
						className: `br-chip tone-${t.tone}`,
						title: `${e.unit} · ${t.label}`,
						children: [
							/* @__PURE__ */ h("span", {
								"aria-hidden": "true",
								children: t.glyph
							}),
							" ",
							e.unit,
							/* @__PURE__ */ g("span", {
								className: "br-sr",
								children: [" · ", t.label]
							})
						]
					}, e.unit);
				})
			})
		]
	});
}
function _u(e, t, n) {
	return e.by === "person" ? e.who === "owner" ? n ? "你（负责人）" : `负责人${t ? ` ${t}` : ""}` : e.who ? "一位组员" : "人" : e.by === "brain" ? `${We.brain}${e.who ? ` ${e.who}` : ""}` : e.by ? We[e.by] ?? e.by : e.who ?? "—";
}
function vu(e, t) {
	i(() => {
		let n = e.current;
		if (!t || !n) return;
		n.scrollIntoView?.({
			behavior: "smooth",
			block: "center"
		});
		let r = n.closest("[data-testid=\"br-detail\"]");
		if (!r || typeof ResizeObserver > "u") return;
		let i = new ResizeObserver(() => n.scrollIntoView?.({ block: "center" }));
		i.observe(r);
		let a = () => {
			i.disconnect();
			for (let e of [
				"wheel",
				"touchstart",
				"keydown"
			]) window.removeEventListener(e, a);
		};
		for (let e of [
			"wheel",
			"touchstart",
			"keydown"
		]) window.addEventListener(e, a, { passive: !0 });
		let o = setTimeout(a, 4e3);
		return () => {
			clearTimeout(o), a();
		};
	}, [t]);
}
function yu({ decisions: e, stages: t, repo: n, owner: r, me: i, go: a, onAt: o, picked: c }) {
	let l = e.filter((e) => e.by === "person").length, u = (e) => t.find((t) => t.id === e.stage)?.at ?? null, d = s(null), f = !!c && e.some((e) => e.id === c);
	return vu(d, f), /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "决定",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "决定" }), /* @__PURE__ */ g("span", {
					className: "cto-dim",
					children: [
						e.length,
						" 条 · 人定了 ",
						l,
						" 条 · 每一条都能在需求看板上看它那个阶段 · 引用的 Brain 条目点开看"
					]
				})]
			}),
			c && !f && e.length > 0 && /* @__PURE__ */ g("p", {
				className: "br-note br-small",
				role: "status",
				children: [
					"这个需求的决定里没有 ",
					c,
					"：决定记录可能改过了，下面是现在的样子。"
				]
			}),
			e.length === 0 ? /* @__PURE__ */ h("p", {
				className: "br-empty",
				children: "还没有记下决定。"
			}) : /* @__PURE__ */ g("table", {
				className: "cto-table br-dec",
				children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
					/* @__PURE__ */ h("th", { children: "编号" }),
					/* @__PURE__ */ h("th", { children: "阶段" }),
					/* @__PURE__ */ h("th", { children: "决定" }),
					/* @__PURE__ */ h("th", { children: "为什么" }),
					/* @__PURE__ */ h("th", { children: "谁定的" }),
					/* @__PURE__ */ h("th", { children: "引用 Brain" }),
					/* @__PURE__ */ h("th", {})
				] }) }), /* @__PURE__ */ h("tbody", { children: e.map((e) => {
					let t = u(e), s = [
						e.by === "unclassified" ? "「谁定的」那一格不是规定的写法：没归类，也不猜是谁" : "",
						e.by === "person" && e.who && e.who !== "owner" ? `化名 ${e.who}：brain-kit 不写真名` : "",
						e.vouchers.length ? `凭证 ${e.vouchers.join("、")}` : ""
					].filter(Boolean).join("；");
					return /* @__PURE__ */ g("tr", {
						"data-testid": "decision",
						"data-decision": e.id,
						ref: e.id === c ? d : void 0,
						className: e.id === c ? "is-picked" : void 0,
						"aria-current": e.id === c ? "true" : void 0,
						children: [
							/* @__PURE__ */ h("td", {
								className: "br-key",
								"data-label": "编号",
								title: [e.date, e.src].filter(Boolean).join(" · "),
								children: e.id
							}),
							/* @__PURE__ */ h("td", {
								className: "br-dim",
								"data-label": "阶段",
								children: De(e.stage) || "—"
							}),
							/* @__PURE__ */ h("td", {
								"data-label": "决定",
								children: /* @__PURE__ */ h(Cr, { text: e.text })
							}),
							/* @__PURE__ */ h("td", {
								className: "br-dim",
								"data-label": "为什么",
								children: e.why ? /* @__PURE__ */ h(Cr, { text: e.why }) : "—"
							}),
							/* @__PURE__ */ h("td", {
								"data-label": "谁定的",
								title: s || void 0,
								children: _u(e, r, i)
							}),
							/* @__PURE__ */ h("td", {
								"data-label": "引用 Brain",
								children: /* @__PURE__ */ h("span", {
									className: "br-row",
									style: { gap: 4 },
									children: e.cites.length ? e.cites.map((e) => /* @__PURE__ */ h(Fr, {
										id: e,
										repo: n,
										go: a
									}, e)) : /* @__PURE__ */ h("span", {
										className: "br-dim",
										children: "—"
									})
								})
							}),
							/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h("button", {
								type: "button",
								className: "cto-link",
								onClick: () => o(t),
								title: t ? `看板回放到 ${de(t)}` : "打开需求看板",
								children: Z.onBoard
							}) })
						]
					}, e.id);
				}) })]
			})
		]
	});
}
function bu({ x: e, repo: t, reqKey: n, onAnswered: r, waiter: i }) {
	let a = e.decisions.flatMap((e) => (e.asked ?? []).map((t) => ({
		q: t,
		d: e.id
	}))), o = [...new Set(a.map((e) => e.q))], s = [...new Set(a.map((e) => e.d))], c = `会话里直接问的（${o.join("、")}），回答记在决定 ${s.join("、")} 里。`;
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "问题和回答",
		children: [/* @__PURE__ */ g("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ h("h3", { children: "问题和回答" }), /* @__PURE__ */ g("span", {
				className: "cto-dim",
				children: [e.questions.length + o.length, " 个 · 能在这里回答的才有回答框"]
			})]
		}), e.questions.length === 0 ? /* @__PURE__ */ h("p", {
			className: "br-empty",
			children: o.length ? `问题都是${c}这里只列停下来等回答的和 MR 上的问题。` : "没有停下来问过人。"
		}) : /* @__PURE__ */ g("div", {
			className: "br-stack",
			children: [e.questions.map((e, a) => /* @__PURE__ */ h(Ir, {
				q: e,
				repo: t,
				reqKey: n,
				onAnswered: r,
				waiter: i
			}, `${e.id ?? "q"}-${a}`)), o.length > 0 && /* @__PURE__ */ g("p", {
				className: "cto-dim",
				style: { margin: 0 },
				children: ["另有", c]
			})]
		})]
	});
}
function xu({ x: e }) {
	let { status: t, next: n, open_questions: r } = e.lean;
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "会话记录",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "会话记录" }), /* @__PURE__ */ h("span", {
					className: "cto-dim",
					children: "Lean 记下的现状和下一步"
				})]
			}),
			t ? /* @__PURE__ */ h("p", {
				className: "br-pre br-strong",
				style: { margin: 0 },
				children: /* @__PURE__ */ h(Cr, { text: t })
			}) : /* @__PURE__ */ h("p", {
				className: "br-empty",
				children: "还没有写。"
			}),
			n.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", {
				className: "br-strong",
				children: "下一步"
			}), /* @__PURE__ */ h("ul", {
				className: "br-list",
				children: n.map((e, t) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h(Cr, { text: e }) }, t))
			})] }),
			r.length > 0 && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", {
				className: "br-strong",
				children: "没解决的问题"
			}), /* @__PURE__ */ h("ul", {
				className: "br-list",
				children: r.map((e, t) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ h(Cr, { text: e }) }, t))
			})] })
		]
	});
}
var Su = /^RUN-.+-\d+$/;
function Cu(e) {
	return Su.test(e.title) ? ul(e.title, !1) : e.title;
}
function wu(e, t) {
	return e.error ? {
		label: "出错",
		tone: "bad"
	} : e.awaiting ? {
		label: "等批准",
		tone: "wait"
	} : e.busy ? {
		label: "在做",
		tone: "run"
	} : t && e.kind === "local" ? {
		label: "等你回话",
		tone: "wait"
	} : {
		label: "空着",
		tone: "idle"
	};
}
var Tu = "现在没有开着的会话";
function Eu({ sessions: e, total: t, note: n, replying: r, at: i }) {
	let a = f();
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "会话",
		children: [/* @__PURE__ */ g("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ h("h3", { children: "会话" }), /* @__PURE__ */ g("span", {
				className: "cto-dim",
				title: n || void 0,
				children: ["这个 app 开的", t === null ? e.length ? " · 用量还没报" : "" : ` · 合计 ${ce(t)} credits`]
			})]
		}), e.length === 0 ? /* @__PURE__ */ h("p", {
			className: "br-empty",
			children: t === null ? "还没开过会话。" : `${Tu}；上面的合计是记下的用量。`
		}) : /* @__PURE__ */ h("ul", {
			className: "br-sessions",
			children: e.map((e) => {
				let t = wu(e, r);
				return /* @__PURE__ */ g("li", {
					className: "br-session",
					"data-testid": "session",
					children: [
						/* @__PURE__ */ h(Y, {
							role: e.kind === "runner" ? "runner" : "laptop",
							size: 22
						}),
						/* @__PURE__ */ g("div", {
							className: "br-stack",
							style: { gap: 2 },
							children: [
								/* @__PURE__ */ g("div", {
									className: "br-row",
									children: [
										/* @__PURE__ */ h("b", {
											className: "br-strong",
											title: Su.test(e.title) ? e.title : void 0,
											children: Cu(e)
										}),
										/* @__PURE__ */ h("span", {
											className: `br-chip tone-${t.tone}`,
											children: t.label
										}),
										/* @__PURE__ */ h("span", {
											className: "br-tag",
											children: e.kind === "local" ? "本机" : "运行机"
										})
									]
								}),
								/* @__PURE__ */ g("div", {
									className: "br-row br-small br-dim",
									children: [
										/* @__PURE__ */ h("code", { children: e.agent }),
										/* @__PURE__ */ g("span", { children: ["credits ", ce(e.credits)] }),
										/* @__PURE__ */ g("span", { children: [e.turns, " 轮"] }),
										/* @__PURE__ */ g("span", { children: ["最近活动：", se(e.last_activity, i)] })
									]
								}),
								e.error && /* @__PURE__ */ h("p", {
									className: "br-error br-small",
									children: e.error
								})
							]
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "kt-btn is-small",
							onClick: () => a(e.url),
							children: [/* @__PURE__ */ h($, {
								name: "MessageSquare",
								size: 13
							}), Z.openSession]
						})
					]
				}, e.slot);
			})
		})]
	});
}
function Du({ x: e, board: t, repo: n, reqKey: r, go: i }) {
	let a = e.brain, o = a.proposals ? Xl(e, t) : null, s = t?.actors.find((e) => e.key === "reflect")?.status ?? null;
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "用到的 Brain",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "用到的 Brain" }), /* @__PURE__ */ h("span", {
					className: "cto-dim",
					children: "开工时带进来的、决定里引用的"
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [/* @__PURE__ */ g("span", {
					className: "kt-pill tone-info",
					children: [
						"加载 ",
						a.loaded ?? "—",
						" 条"
					]
				}), /* @__PURE__ */ g("span", {
					className: "kt-pill tone-ok",
					children: [
						"引用 ",
						a.cited.length,
						" 条"
					]
				})]
			}),
			a.proposals !== null && a.proposals > 0 && /* @__PURE__ */ g("div", {
				className: "br-row",
				"data-testid": "brain-proposals",
				children: [/* @__PURE__ */ g("span", { children: [
					"提议 ",
					a.proposals,
					" 条新知识：",
					s === "merged" ? /* @__PURE__ */ g(m, { children: ["已合进 Brain", o && /* @__PURE__ */ g("span", {
						className: "br-dim",
						children: [
							"（回写分支 ",
							/* @__PURE__ */ h(eu, { path: o }),
							"）"
						]
					})] }) : o || s === "done" ? /* @__PURE__ */ g(m, { children: [
						"已写到回写分支",
						o && /* @__PURE__ */ g(m, { children: [" ", /* @__PURE__ */ h(eu, { path: o })] }),
						"，等合并"
					] }) : "还没回写到 Brain"
				] }), /* @__PURE__ */ h("button", {
					type: "button",
					className: "cto-link",
					onClick: () => i({
						kind: "brain",
						...n === "runner" ? {} : { repo: n },
						reflect: r
					}),
					children: "在 Brain 里看 ↗"
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				"aria-label": "引用",
				children: [/* @__PURE__ */ h("span", {
					className: "br-dim br-small",
					children: "引用"
				}), a.cited.length ? a.cited.map((e) => /* @__PURE__ */ h(Fr, {
					id: e,
					repo: n,
					go: i
				}, e)) : /* @__PURE__ */ h("span", {
					className: "br-dim",
					children: "—"
				})]
			}),
			a.stale.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-row",
				"aria-label": "过时",
				children: [/* @__PURE__ */ h("span", {
					className: "br-warn-text br-small",
					children: "标成过时"
				}), a.stale.map((e) => /* @__PURE__ */ h(Fr, {
					id: e,
					repo: n,
					go: i
				}, e))]
			}),
			a.unknown.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-row",
				"aria-label": "不认识",
				children: [/* @__PURE__ */ h("span", {
					className: "br-bad-text br-small",
					children: "Brain 里没有"
				}), a.unknown.map((e) => /* @__PURE__ */ h("span", {
					className: "br-tag br-mono",
					children: e
				}, e))]
			})
		]
	});
}
function Ou(e) {
	if (!e) return "—";
	let t = q(e);
	return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(t) ? t.slice(11) : "—";
}
var ku = /^[A-Z]-[0-9A-F]{4,}$/;
function Au(e) {
	return e.kind === "app" && e.label.startsWith("回写 Brain") && e.detail ? {
		label: e.label,
		detail: `分支 ${e.detail}`,
		title: null
	} : e.kind === "commit" && e.detail && /^[0-9a-f]{7,40}$/.test(e.detail) ? {
		label: e.label,
		detail: e.detail.slice(0, 8),
		title: e.detail
	} : e.detail && /^claim\/\S+ 推到 origin$/.test(e.detail) ? {
		label: e.label,
		detail: "认领推到了远端",
		title: e.detail
	} : e.kind === "handover" && e.detail && Su.test(e.detail) ? {
		label: e.label,
		detail: ul(e.detail, !1),
		title: e.detail
	} : e.kind === "handover" && e.detail && /^[0-9a-f]{7,40}$/.test(e.detail) ? {
		label: e.label,
		detail: null,
		title: `提交 ${e.detail}`
	} : {
		label: e.label.replace(/\s*[:：]\s*$/, ""),
		detail: e.detail ? e.detail.replace(/^工作区 /, "工作目录 ") : null,
		title: null
	};
}
function ju({ error: e }) {
	let t = /[\u4e00-\u9fff]/.test(e) && !/[A-Za-z]{4,}/.test(e.replace(/brain-kit|Lean|KiroCrew|trace/g, ""));
	return /* @__PURE__ */ g("div", {
		className: "br-note",
		role: "status",
		"data-testid": "timeline-error",
		children: [
			/* @__PURE__ */ h("p", {
				style: { margin: 0 },
				children: t ? e : "这个需求的记录有一部分读不出来，下面只列读到的。"
			}),
			!(t && /设置/.test(e)) && /* @__PURE__ */ g("p", {
				className: "br-hint",
				children: [
					"做什么：等一会儿它会自己再读；一直这样的话，",
					t ? "到设置里看 brain-kit 能不能用" : "把细节里的原话发给维护 app 的人",
					"。"
				]
			}),
			!t && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e })]
			})
		]
	});
}
function Mu(e, t, n) {
	return e ? e === "owner" || e === t ? n ? "你" : t ?? "负责人" : ku.test(e) ? "一位组员" : e : null;
}
function Nu({ x: e, showMissing: t, me: n }) {
	let r = e.timeline, i = [...r.items].sort((e, t) => (Gl(t.at) ?? 0) - (Gl(e.at) ?? 0)), a = /* @__PURE__ */ new Map();
	for (let e of i) {
		let t = fe(e.at) ?? "没有时间";
		a.set(t, [...a.get(t) ?? [], e]);
	}
	let o = r.missing.filter((e) => !/[\u4e00-\u9fff]/.test(e)), s = [...new Set(r.missing.map((e) => o.includes(e) ? qe(e) : e))];
	return /* @__PURE__ */ g("section", {
		className: "cto-card",
		"aria-label": "时间线",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "时间线" }), /* @__PURE__ */ g("span", {
					className: "cto-dim",
					children: ["最新的在上面 · ", r.source === "trace" ? "brain-kit 记下的" : "app 从 Lean 记录和提交拼的"]
				})]
			}),
			r.error && /* @__PURE__ */ h(ju, { error: r.error }),
			/* @__PURE__ */ h("div", {
				className: "br-tlbox",
				children: i.length === 0 ? /* @__PURE__ */ h("p", {
					className: "br-empty",
					children: "还没有记录。"
				}) : [...a.entries()].map(([t, r]) => /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("p", {
					className: "br-day",
					children: t
				}), /* @__PURE__ */ h("ol", {
					className: "br-tl",
					children: r.map((t, r) => {
						let i = Vl[t.kind] ?? {
							icon: "commit",
							label: t.kind
						}, a = Au(t), o = !!a.detail && a.detail.length > 60, s = Mu(t.who, e.row.owner, n);
						return /* @__PURE__ */ g("li", {
							"data-testid": "tl-item",
							"data-kind": t.kind,
							title: [a.title, t.who && ku.test(t.who) ? `化名 ${t.who}` : null].filter(Boolean).join(" · ") || void 0,
							children: [
								/* @__PURE__ */ h("time", { children: Ou(t.at) }),
								/* @__PURE__ */ g("span", {
									title: i.label,
									children: [/* @__PURE__ */ h(Y, {
										role: i.icon,
										size: 16
									}), /* @__PURE__ */ h("span", {
										className: "br-sr",
										children: i.label
									})]
								}),
								/* @__PURE__ */ g("span", { children: [
									/* @__PURE__ */ h("span", {
										className: "br-strong",
										children: /* @__PURE__ */ h(xr, { text: a.label })
									}),
									a.detail && !o && /* @__PURE__ */ g("span", {
										className: "br-dim",
										children: [" · ", /* @__PURE__ */ h(xr, { text: a.detail })]
									}),
									s && /* @__PURE__ */ g("span", {
										className: "br-dim br-small",
										children: [" · ", s]
									}),
									o && /* @__PURE__ */ g("details", { children: [/* @__PURE__ */ h("summary", {
										className: "br-small",
										children: "看说明"
									}), /* @__PURE__ */ h("span", {
										className: "br-dim br-small",
										children: /* @__PURE__ */ h(Cr, { text: a.detail })
									})] })
								] })
							]
						}, r);
					})
				})] }, t))
			}),
			t && s.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-note br-small br-tlmissing",
				children: [
					"时间线里缺这些记录：",
					s.join("；"),
					o.length > 0 && /* @__PURE__ */ g("details", {
						className: "br-raw",
						children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: o.join("\n") })]
					})
				]
			}),
			(r.other_runs ?? []).length > 0 && /* @__PURE__ */ g("div", {
				className: "br-note br-small br-tlmissing",
				"data-testid": "tl-other-runs",
				children: ["它在别的分支上也跑过，没算进这条时间线：", r.other_runs.join("；")]
			})
		]
	});
}
//#endregion
//#region src/views/Import.tsx
var Pu = "把一个项目仓库导进来：先只读地检查它；没装 brain-kit 的，默认直接装在当前分支并提交，当天就能开需求（团队仓库推送以后就能开；也可以装到新分支、开 MR，合并以后才能开）；装好就自动加入列表，交付总览和开需求就能用它了。", Fu = {
	OK: "✓",
	WARN: "!",
	FAIL: "✗"
}, Iu = {
	added: "新增",
	modified: "改动",
	deleted: "删除",
	other: "其他"
}, Lu = {
	added: "ok",
	modified: "warn",
	deleted: "bad",
	other: "idle"
}, Ru = [
	"added",
	"modified",
	"deleted",
	"other"
], zu = {
	req_prefix: "",
	tracker: "none",
	jira_base: "",
	gitlab_base: "",
	gitlab_project: "",
	default_branch: "main",
	team: ""
};
function Bu(e) {
	let t = e.trim().replace(/\/+$/, "").split(/[/:]/).pop() ?? "";
	return t.endsWith(".git") ? t.slice(0, -4) : t;
}
var Vu = (e, t) => t.id === "kit" && e.next === "install" && e.kit.state === "none";
function Hu({ entry: e, go: t, setStatus: r, reloadStatus: i, pollMs: a }) {
	let o = u(), s = Math.min(a ?? 1e3, J), l = N(E.importDefaults(), 0), [d, f] = c("local"), [p, m] = c(e.path ?? ""), [_, v] = c(null), [y, b] = c(null), [x, S] = c(0), C = P((e) => o.post(E.importInspect(), { path: e })), w = P((e) => o.post(E.importAdd(), { path: e })), T = n(async (e, t = !1) => {
		let n = await C.run(e);
		n && (v({
			path: e,
			result: n
		}), t && S((e) => e + 1));
	}, [C]), D = async (e) => {
		let t = await w.run(e);
		return t && (b(t), r(t.status)), t;
	}, O = ye(s, (e) => {
		if (i(), e.state !== "done" || !e.result?.commit.ok || !_) return;
		let t = _.path;
		(async () => {
			_.result.listed || await D(_.result.path ?? t), await T(t);
		})();
	}), k = _?.result ?? null, A = !!_ && d === "local" && p.trim() !== _.path, j = k && !A ? k : null, M = O.job && k?.path && O.job.target === k.path ? O.job : null, ee = y && j?.path && y.status.repos.some((e) => e.id === y.id && e.path === j.path) ? y : null, F = () => _ && void T(_.path), te = (e) => {
		f("local"), m(e), T(e, !0);
	}, I = (() => {
		if (j && j.next !== "fix") return M && M.state === "done" && M.result?.commit.ok ? "done" : j.next === "add" || j.next === "listed" && !j.pending ? "off" : j.next === "pending" || j.next === "listed" ? j.pending?.state === "uncommitted" ? "wait" : j.install ? "now" : "done" : !M || M.state === "running" ? "now" : M.state === "failed" ? "bad" : M.result?.commit.ok ? "done" : "wait";
	})(), L = !j || j.next === "fix" || j.next === "install" ? ee ? "done" : void 0 : j.next === "listed" || ee ? "done" : "now", R = [
		j ? "done" : "now",
		j ? j.next === "fix" ? "bad" : "done" : C.busy ? "now" : void 0,
		I,
		L
	], z = Nt.map((e, t) => ({
		...e,
		state: R[t],
		...t === 2 && I === "off" ? { text: "已经装了：不用装" } : {}
	})), B = !!j && !M && !!j.install && j.next !== "install" && !!j.pending, V = !!j && (j.next === "install" || !!M || B), ne = (l.data?.found ?? []).filter((e) => e.path !== j?.path), re = j && /* @__PURE__ */ h(Qu, {
		c: j,
		job: M,
		state: I,
		readError: O.readError,
		onStart: O.start,
		onCommitted: async () => {
			j.path && !j.listed && await D(j.path), F();
		},
		added: ee,
		addBusy: w.busy,
		addError: w.error,
		onAdd: () => j.path && void D(j.path),
		onChanged: () => {
			i(), F();
		},
		go: t
	}, `install:${j.path}`);
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view imp-root",
		"data-testid": "br-import",
		children: [
			/* @__PURE__ */ h("style", { children: sd }),
			/* @__PURE__ */ g("section", {
				className: "br-hero imp-hero",
				"aria-label": "导入仓库",
				children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("h2", { children: "导入仓库" }), /* @__PURE__ */ h("p", { children: Pu })] }), /* @__PURE__ */ h(Bt, {
					steps: z,
					label: "导入的步骤"
				})]
			}),
			/* @__PURE__ */ g("section", {
				className: "br-card imp-sec",
				"aria-label": "从哪来",
				children: [
					/* @__PURE__ */ h(Uu, {
						n: 1,
						title: "从哪来",
						state: R[0],
						sub: "这台机器上的目录，或者从 GitLab 克隆"
					}),
					/* @__PURE__ */ g("div", {
						className: "imp-options",
						role: "radiogroup",
						"aria-label": "从哪来",
						children: [/* @__PURE__ */ h(Wu, {
							value: "local",
							on: d === "local",
							icon: "laptop",
							title: "本机目录",
							text: "这台机器上的检出；子目录、工作区也行",
							onPick: () => f("local")
						}), /* @__PURE__ */ h(Wu, {
							value: "clone",
							on: d === "clone",
							icon: "clone",
							title: "克隆（git 地址）",
							text: "先克隆到本机，再检查",
							onPick: () => f("clone")
						})]
					}),
					d === "local" ? /* @__PURE__ */ g("form", {
						className: "imp-local",
						"aria-label": "本机目录",
						onSubmit: (e) => {
							e.preventDefault(), T(p.trim(), !0);
						},
						children: [
							ne.length > 0 && /* @__PURE__ */ h(Gu, {
								found: ne,
								busy: C.busy,
								onPick: te
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [
									/* @__PURE__ */ h("label", {
										htmlFor: "imp-path",
										children: "仓库目录"
									}),
									/* @__PURE__ */ g("div", {
										className: "imp-inline",
										children: [/* @__PURE__ */ h("input", {
											id: "imp-path",
											type: "text",
											className: "br-mono",
											value: p,
											placeholder: "~/workplace/shop-pay",
											onChange: (e) => m(e.target.value)
										}), /* @__PURE__ */ g("button", {
											type: "submit",
											className: "br-btn is-primary is-big",
											disabled: !p.trim() || C.busy,
											children: [/* @__PURE__ */ h(Y, {
												role: "lint",
												size: 17
											}), C.busy ? "正在检查…" : "检查"]
										})]
									}),
									/* @__PURE__ */ h("p", {
										className: "br-hint",
										children: "以 / 或 ~ 开头的完整路径。仓库里的子目录、工作区也行：会找到仓库本身。只读，什么都不改。"
									})
								]
							}),
							A && /* @__PURE__ */ g("p", {
								className: "imp-stale",
								role: "status",
								children: [/* @__PURE__ */ h("i", {
									"aria-hidden": "true",
									children: "!"
								}), "目录改过了：再检查一遍。"]
							})
						]
					}) : /* @__PURE__ */ h(Ku, {
						defaults: l.data,
						ms: s,
						onCloned: (e) => {
							m(e), T(e, !0);
						}
					}),
					C.error && /* @__PURE__ */ h("p", {
						className: "br-error",
						role: "alert",
						children: C.error
					})
				]
			}),
			j && /* @__PURE__ */ h(Xu, {
				c: j,
				busy: C.busy,
				state: R[1],
				asked: x,
				onRecheck: F,
				onFixed: () => {
					i(), F();
				}
			}),
			V && !B && re,
			j && !M && (j.next === "pending" || j.next === "listed") && j.pending && j.path && /* @__PURE__ */ h(rd, {
				path: j.path,
				p: j.pending,
				onChanged: () => {
					i(), F();
				}
			}, `pending:${j.path}`),
			B && re,
			j && !M && j.next === "listed" && /* @__PURE__ */ g("section", {
				className: "br-card imp-sec is-ok",
				"aria-label": "加入列表",
				children: [/* @__PURE__ */ h(Uu, {
					n: 4,
					title: "加入列表",
					state: "done"
				}), /* @__PURE__ */ g("div", {
					className: "imp-done",
					role: "status",
					"data-testid": "next-listed",
					children: [
						/* @__PURE__ */ h("span", {
							className: "imp-mark",
							"aria-hidden": "true",
							children: "✓"
						}),
						/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", { children: "已经在列表里。" }), /* @__PURE__ */ h("small", { children: j.pending ? j.pending.next : "交付总览、开需求都能用它。" })] }),
						/* @__PURE__ */ g("div", {
							className: "br-row",
							children: [!j.pending && j.listed && /* @__PURE__ */ g("button", {
								type: "button",
								className: "br-btn is-primary",
								onClick: () => t({
									kind: "new",
									repo: j.listed
								}),
								children: [/* @__PURE__ */ h(Y, {
									role: "new",
									size: 16
								}), "开需求"]
							}), /* @__PURE__ */ g("button", {
								type: "button",
								className: "br-btn",
								onClick: () => t({ kind: "overview" }),
								children: [/* @__PURE__ */ h(Y, {
									role: "list",
									size: 16
								}), "去交付总览"]
							})]
						})
					]
				})]
			}),
			j && !M && (j.next === "add" || j.next === "pending") && j.path && /* @__PURE__ */ h(od, {
				pending: j.next === "pending" ? j.pending : null,
				state: L,
				result: ee,
				busy: w.busy,
				error: w.error,
				onAdd: () => j.path && void D(j.path),
				go: t
			}, `add:${j.path}`)
		]
	});
}
function Uu({ n: e, title: t, state: n, sub: r, children: i }) {
	return /* @__PURE__ */ g("header", {
		className: "imp-head",
		"data-step": e,
		"data-state": n,
		children: [
			/* @__PURE__ */ h("span", {
				className: `imp-n${n ? ` is-${n}` : ""}`,
				"aria-hidden": "true",
				children: n === "done" ? "✓" : e
			}),
			/* @__PURE__ */ h("h3", { children: t }),
			r && /* @__PURE__ */ h("small", {
				"data-testid": `sub-${e}`,
				children: r
			}),
			i
		]
	});
}
function Wu({ value: e, on: t, icon: n, title: r, text: i, onPick: a }) {
	let o = `imp-src-${e}`;
	return /* @__PURE__ */ g("label", {
		className: `imp-option${t ? " is-on" : ""}`,
		"data-source": e,
		children: [
			/* @__PURE__ */ h("input", {
				type: "radio",
				name: "imp-source",
				value: e,
				checked: t,
				onChange: a,
				"aria-labelledby": `${o}-t`,
				"aria-describedby": `${o}-d`
			}),
			/* @__PURE__ */ h(Y, {
				role: n,
				size: 30
			}),
			/* @__PURE__ */ h("b", {
				id: `${o}-t`,
				children: r
			}),
			/* @__PURE__ */ h("small", {
				id: `${o}-d`,
				children: i
			}),
			/* @__PURE__ */ h("span", {
				className: "imp-tick",
				"aria-hidden": "true",
				children: t ? "✓" : ""
			})
		]
	});
}
function Gu({ found: e, busy: t, onPick: n }) {
	return /* @__PURE__ */ g("div", {
		className: "imp-found",
		role: "group",
		"aria-label": "这台机器上的仓库",
		"data-testid": "found",
		children: [/* @__PURE__ */ h("span", {
			className: "br-label",
			children: "这台机器上的仓库（点一下就检查）"
		}), /* @__PURE__ */ h("ul", { children: e.map((e) => /* @__PURE__ */ h("li", { children: /* @__PURE__ */ g("button", {
			type: "button",
			className: "imp-found-btn",
			disabled: t,
			title: e.path,
			onClick: () => n(e.path),
			children: [
				/* @__PURE__ */ h(Y, {
					role: "file",
					size: 15
				}),
				/* @__PURE__ */ h("b", { children: e.name }),
				/* @__PURE__ */ h("code", { children: e.path.replace(/^\/(?:Users|home)\/[^/]+/, "~") }),
				e.listed ? /* @__PURE__ */ h("span", {
					className: "br-chip tone-ok",
					children: "已在列表里"
				}) : e.installed ? /* @__PURE__ */ h("span", {
					className: "br-chip tone-info",
					children: "已装 brain-kit"
				}) : null
			]
		}) }, e.path)) })]
	});
}
function Ku({ defaults: e, ms: t, onCloned: n }) {
	let r = u(), [i, a] = c(""), [o, s] = c(null), [l, d] = c(""), f = P((e) => r.post(E.importClone(), e)), p = ye(t, (e) => {
		e.state === "done" && e.result?.path && n(e.result.path);
	}), m = o ?? e?.clone_parent ?? "", _ = p.job?.state === "running", v = async () => {
		let e = await f.run({
			url: i.trim(),
			parent: m.trim(),
			name: l.trim()
		});
		e && p.start(e.job);
	};
	return /* @__PURE__ */ g("form", {
		className: "imp-clone",
		"aria-label": "克隆",
		onSubmit: (e) => {
			e.preventDefault(), v();
		},
		children: [
			/* @__PURE__ */ g("div", {
				className: "imp-grid",
				children: [
					/* @__PURE__ */ g("div", {
						className: "br-field is-full",
						children: [
							/* @__PURE__ */ h("label", {
								htmlFor: "imp-url",
								children: "仓库地址"
							}),
							/* @__PURE__ */ h("input", {
								id: "imp-url",
								type: "text",
								className: "br-mono",
								value: i,
								placeholder: "git@gitlab.example.com:组/仓库.git",
								onChange: (e) => a(e.target.value)
							}),
							/* @__PURE__ */ h("p", {
								className: "br-hint",
								children: "SSH 或 https 地址。别把密码或令牌写进地址：这里不会弹窗问密码。"
							})
						]
					}),
					/* @__PURE__ */ g("div", {
						className: "br-field",
						children: [
							/* @__PURE__ */ h("label", {
								htmlFor: "imp-parent",
								children: "放在哪个目录下"
							}),
							/* @__PURE__ */ h("input", {
								id: "imp-parent",
								type: "text",
								className: "br-mono",
								value: m,
								onChange: (e) => s(e.target.value)
							}),
							/* @__PURE__ */ g("p", {
								className: "br-hint",
								children: [
									"别放进每个需求的工作目录",
									e?.work_root ? `（${e.work_root}）` : "",
									"里面。"
								]
							})
						]
					}),
					/* @__PURE__ */ g("div", {
						className: "br-field",
						children: [/* @__PURE__ */ h("label", {
							htmlFor: "imp-name",
							children: "目录名（可不填）"
						}), /* @__PURE__ */ h("input", {
							id: "imp-name",
							type: "text",
							className: "br-mono",
							value: l,
							placeholder: Bu(i) || "shop-pay",
							onChange: (e) => d(e.target.value)
						})]
					})
				]
			}),
			/* @__PURE__ */ h("div", {
				className: "br-row",
				children: /* @__PURE__ */ g("button", {
					type: "submit",
					className: "br-btn is-primary is-big",
					disabled: !i.trim() || f.busy || _,
					children: [/* @__PURE__ */ h(Y, {
						role: "clone",
						size: 17
					}), _ ? "正在克隆…" : "克隆"]
				})
			}),
			f.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: f.error
			}),
			p.job && /* @__PURE__ */ h(qu, {
				job: p.job,
				what: "克隆",
				readError: p.readError
			}),
			p.job?.state === "done" && p.job.result?.path && /* @__PURE__ */ g("p", {
				className: "br-ok-text",
				role: "status",
				children: [
					"克隆好了：",
					p.job.result.path,
					"。下面是它的检查。"
				]
			})
		]
	});
}
function qu({ job: e, what: t, readError: n }) {
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
	], c = (e.ended_at ?? Date.now() / 1e3) - e.started_at, l = c < 1 ? "不到 1 秒" : G(c);
	return /* @__PURE__ */ g("div", {
		className: `imp-job tone-${a}`,
		role: "group",
		"aria-label": `${t}的进度`,
		"data-job": e.kind,
		children: [
			/* @__PURE__ */ g("div", {
				className: "imp-job-head",
				children: [/* @__PURE__ */ g("span", {
					className: `br-chip kt-pill tone-${a}${r ? " is-live" : ""}`,
					children: [/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: o
					}), s]
				}), /* @__PURE__ */ h("span", {
					className: "imp-elapsed",
					"data-testid": `elapsed-${e.kind}`,
					children: r ? `已经 ${l}` : `用了 ${l}`
				})]
			}),
			/* @__PURE__ */ h(wt, { job: e }),
			n && /* @__PURE__ */ h("p", {
				className: "br-note",
				role: "status",
				children: n
			})
		]
	});
}
function Ju({ rows: e, next: t, todo: n }) {
	return /* @__PURE__ */ h("ul", {
		className: "imp-checks",
		"data-testid": "import-checks",
		children: e.map((e) => {
			let r = t?.(e) ?? !1, i = n?.(e);
			return /* @__PURE__ */ g("li", {
				className: `imp-check is-${r ? "next" : e.level}`,
				"data-check": e.id,
				"data-level": r ? "next" : e.level,
				children: [
					/* @__PURE__ */ h("span", {
						className: `imp-glyph tone-${r ? "info" : tt[e.level]}`,
						role: "img",
						"aria-label": r ? "下一步" : nt[e.level],
						children: r ? "→" : Fu[e.level]
					}),
					/* @__PURE__ */ g("span", {
						className: "imp-check-main",
						children: [/* @__PURE__ */ h("b", { children: e.label }), /* @__PURE__ */ h("span", {
							className: "br-pre",
							children: e.why
						})]
					}),
					i ? /* @__PURE__ */ h("span", {
						className: "imp-todo is-box",
						children: i
					}) : e.todo && /* @__PURE__ */ g("span", {
						className: "imp-todo",
						children: [/* @__PURE__ */ h("b", { children: "做什么" }), e.todo]
					})
				]
			}, e.id);
		})
	});
}
function Yu({ levels: e }) {
	let t = (t) => e.filter((e) => e === t).length;
	return /* @__PURE__ */ h("span", {
		className: "imp-counts",
		children: [
			"OK",
			"WARN",
			"FAIL"
		].filter((e) => t(e) > 0).map((e) => /* @__PURE__ */ g("span", {
			className: `br-chip kt-pill tone-${tt[e]}`,
			"data-count": e,
			children: [
				/* @__PURE__ */ h("i", {
					"aria-hidden": "true",
					children: Fu[e]
				}),
				t(e),
				/* @__PURE__ */ g("span", {
					className: "br-sr",
					children: [" 项", nt[e]]
				})
			]
		}, e))
	});
}
function Xu({ c: e, busy: t, state: n, asked: r, onRecheck: a, onFixed: o }) {
	let c = s(null), l = C();
	i(() => {
		r && c.current?.scrollIntoView?.({
			block: "start",
			behavior: l ? "auto" : "smooth"
		});
	}, [r]);
	let u = (t) => Vu(e, t), d = (t) => t.id === "me" && e.me?.ask && e.path ? /* @__PURE__ */ h(Rt, {
		path: e.path,
		me: e.me,
		onSaved: o
	}, e.path) : null, f = e.checks.some((e) => e.id === "me" && e.level !== "OK"), p = e.checks.filter((e) => e.level !== "OK" || u(e)), m = e.checks.filter((e) => e.level === "OK" && !u(e)), _ = e.crew.rows.filter((e) => e.level !== "OK"), v = e.crew.rows.filter((e) => e.level === "OK");
	return /* @__PURE__ */ g("section", {
		ref: c,
		className: `br-card imp-sec imp-inspect${e.next === "fix" ? " is-bad" : ""}`,
		"aria-label": "检查",
		"data-testid": "inspect",
		children: [
			/* @__PURE__ */ g(Uu, {
				n: 2,
				title: "检查",
				state: n,
				children: [
					e.path && /* @__PURE__ */ h("code", {
						className: "imp-path",
						children: e.path
					}),
					/* @__PURE__ */ h(Yu, { levels: e.checks.filter((e) => !u(e)).map((e) => e.level) }),
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small imp-end",
						disabled: t,
						onClick: a,
						children: [/* @__PURE__ */ h($, {
							name: "RefreshCw",
							size: 13
						}), t ? "正在检查…" : "再检查一遍"]
					})
				]
			}),
			e.note && /* @__PURE__ */ h("p", {
				className: "br-hint",
				children: e.note
			}),
			e.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: e.error
			}),
			p.length > 0 && /* @__PURE__ */ h(Ju, {
				rows: p,
				next: u,
				todo: d
			}),
			m.length > 0 && /* @__PURE__ */ g("details", {
				className: "imp-more imp-fold",
				"data-testid": "checks-fine",
				open: p.length === 0 || void 0,
				children: [/* @__PURE__ */ h("summary", { children: p.length ? `另外 ${m.length} 项正常` : `${m.length} 项都正常` }), /* @__PURE__ */ h(Ju, { rows: m })]
			}),
			e.me?.ask && e.path && !f && /* @__PURE__ */ h(Rt, {
				path: e.path,
				me: e.me,
				onSaved: o
			}, e.path),
			e.crew.rows.length > 0 && _.length === 0 && /* @__PURE__ */ g("details", {
				className: "imp-more imp-block",
				"data-testid": "crew-fine",
				children: [/* @__PURE__ */ h("summary", { children: /* @__PURE__ */ g("span", {
					className: "imp-block-head imp-sum",
					children: [
						/* @__PURE__ */ h(Y, {
							role: "settings",
							size: 18
						}),
						/* @__PURE__ */ h("b", { children: "KiroCrew" }),
						/* @__PURE__ */ h(Yu, { levels: v.map((e) => e.level) }),
						"都正常"
					]
				}) }), /* @__PURE__ */ h(xt, { rows: v })]
			}),
			_.length > 0 && /* @__PURE__ */ g("div", {
				className: "imp-block",
				children: [
					/* @__PURE__ */ g("div", {
						className: "imp-block-head",
						children: [
							/* @__PURE__ */ h(Y, {
								role: "settings",
								size: 18
							}),
							/* @__PURE__ */ h("b", { children: "KiroCrew" }),
							/* @__PURE__ */ h(Yu, { levels: e.crew.rows.map((e) => e.level) })
						]
					}),
					/* @__PURE__ */ h(xt, {
						rows: _,
						fix: e.crew.fix,
						onFixed: o
					}),
					v.length > 0 && /* @__PURE__ */ g("details", {
						className: "imp-more imp-fold",
						children: [/* @__PURE__ */ g("summary", { children: [
							"另外 ",
							v.length,
							" 项正常"
						] }), /* @__PURE__ */ h(xt, { rows: v })]
					})
				]
			}),
			e.next === "fix" && /* @__PURE__ */ g("div", {
				className: "imp-verdict",
				"data-testid": "next-fix",
				children: [/* @__PURE__ */ h(Y, {
					role: "blocked",
					size: 20
				}), /* @__PURE__ */ h("b", { children: "先处理上面打 ✗ 的几行，再检查一遍。" })]
			})
		]
	});
}
function Zu({ k: e }) {
	let t = e.req_prefix.trim().toUpperCase(), n = [
		["需求号", e.tracker === "jira" ? "Jira 上的号" : t ? `${t}-1` : ""],
		["跟踪", Ye[e.tracker] ?? e.tracker],
		["默认分支", e.default_branch.trim()],
		["GitLab", e.gitlab_project.trim() || "不用 GitLab"],
		["团队", e.team.trim()]
	];
	return /* @__PURE__ */ h("ul", {
		className: "imp-kv",
		"aria-label": "这个仓库的 brain-kit 设置",
		children: n.map(([e, t]) => /* @__PURE__ */ g("li", {
			className: t ? void 0 : "is-empty",
			children: [/* @__PURE__ */ h("small", { children: e }), /* @__PURE__ */ h("b", { children: t || "—" })]
		}, e))
	});
}
function Qu({ c: e, job: t, state: n, readError: r, onStart: i, onCommitted: a, added: o, addBusy: s, addError: l, onAdd: d, onChanged: f, go: p }) {
	let _ = u(), [v, y] = c(() => e.form ?? zu), [b, x] = c(() => !e.form?.req_prefix), [S, C] = c(e.branch), w = e.install, T = e.next !== "install" && !!e.pending, [D, O] = c(null), k = w?.options.filter((e) => e.ok) ?? [], A = (k.some((e) => e.mode === D) ? D : null) ?? k.find((e) => e.mode === w?.recommend)?.mode ?? k[0]?.mode ?? "inplace", j = P((e) => _.post(E.importInstall(), e)), M = (e) => y((t) => ({
		...t,
		...e
	})), N = t?.state === "running", ee = t?.state === "done" && !!t.result?.commit.ok, F = w?.current || e.current_branch || "当前分支", te = w?.options.find((e) => e.mode === A), I = async () => {
		if (!e.path) return;
		let t = await j.run({
			path: e.path,
			branch: A === "branch" ? S.trim() : "",
			mode: A,
			kit: {
				...v,
				req_prefix: v.req_prefix.trim().toUpperCase()
			}
		});
		t && i(t.job);
	}, L = !!e.origin?.project && v.gitlab_project === e.origin.project, R = v.tracker === "jira", z = t && !N ? t.result : null, B = ee && z ? z.mode === "inplace" ? `装好了，提交在 ${z.branch}` : `装在 ${z.branch} 分支上，合进 ${z.target || "默认分支"} 以后生效` : N ? "正在装…" : t?.state === "failed" ? "没装成" : T ? `这个安装分支合不进去了：改成直接装在 ${F}` : "这个仓库还没装 brain-kit（会一起装上 AI-DLC Lean、Brain 文件、AGENTS.md）";
	return /* @__PURE__ */ g("section", {
		className: `br-card imp-sec${ee ? " is-ok" : ""}`,
		"aria-label": "安装",
		"data-testid": "install",
		children: [
			/* @__PURE__ */ h(Uu, {
				n: 3,
				title: "安装",
				state: n,
				sub: B
			}),
			!t && /* @__PURE__ */ g(m, { children: [
				T && /* @__PURE__ */ g("p", {
					className: "imp-where",
					"data-testid": "install-again",
					children: [
						/* @__PURE__ */ h(Y, {
							role: "commit",
							size: 18
						}),
						/* @__PURE__ */ g("b", { children: ["改成直接装在 ", F] }),
						/* @__PURE__ */ g("span", { children: [
							"装好以后，删掉没推送的 ",
							e.pending?.branch,
							" 分支和它的工作目录（那次没合进去的安装）。",
							te?.line ?? ""
						] })
					]
				}),
				!T && (w && w.options.length > 1 ? /* @__PURE__ */ h("div", {
					className: "imp-options",
					role: "radiogroup",
					"aria-label": "装在哪",
					"data-testid": "install-modes",
					children: w.options.map((e) => /* @__PURE__ */ h(ed, {
						o: e,
						on: A === e.mode,
						rec: e.mode === w.recommend,
						onPick: () => O(e.mode)
					}, e.mode))
				}) : /* @__PURE__ */ g("p", {
					className: "imp-where",
					"data-testid": "install-where",
					children: [
						/* @__PURE__ */ h(Y, {
							role: "commit",
							size: 18
						}),
						/* @__PURE__ */ h("b", { children: te?.title ?? `直接装在 ${F}` }),
						/* @__PURE__ */ h("span", { children: te?.line ?? "" })
					]
				})),
				/* @__PURE__ */ g("form", {
					className: `imp-install${b ? " is-editing" : ""}`,
					"aria-label": "这个仓库的 brain-kit 设置",
					onSubmit: (e) => {
						e.preventDefault(), I();
					},
					children: [b && /* @__PURE__ */ g("div", {
						className: "imp-grid",
						children: [
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [
									/* @__PURE__ */ h("label", {
										htmlFor: "imp-prefix",
										children: "需求号前缀"
									}),
									/* @__PURE__ */ h("input", {
										id: "imp-prefix",
										type: "text",
										className: "br-mono",
										value: v.req_prefix,
										onChange: (e) => M({ req_prefix: e.target.value.toUpperCase() })
									}),
									/* @__PURE__ */ h("p", {
										className: "br-hint",
										children: v.req_prefix ? `需求号会是 ${v.req_prefix}-1、${v.req_prefix}-2 …` : "大写字母开头，最多 10 个，比如 PAY"
									})
								]
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [/* @__PURE__ */ h("span", {
									className: "br-label",
									id: "imp-tracker-l",
									children: "跟踪方式"
								}), /* @__PURE__ */ g("div", {
									className: "imp-seg",
									role: "radiogroup",
									"aria-labelledby": "imp-tracker-l",
									children: [/* @__PURE__ */ g("label", {
										className: `imp-opt${R ? "" : " is-on"}`,
										children: [/* @__PURE__ */ h("input", {
											type: "radio",
											name: "imp-tracker",
											checked: !R,
											onChange: () => M({ tracker: "none" })
										}), /* @__PURE__ */ h("span", { children: "不用 Jira：按顺序给号" })]
									}), /* @__PURE__ */ g("label", {
										className: `imp-opt${R ? " is-on" : ""}`,
										children: [/* @__PURE__ */ h("input", {
											type: "radio",
											name: "imp-tracker",
											checked: R,
											onChange: () => M({ tracker: "jira" })
										}), /* @__PURE__ */ h("span", { children: "用 Jira 的号" })]
									})]
								})]
							}),
							R && /* @__PURE__ */ g("div", {
								className: "br-field is-full",
								children: [/* @__PURE__ */ h("label", {
									htmlFor: "imp-jira",
									children: "Jira 地址"
								}), /* @__PURE__ */ h("input", {
									id: "imp-jira",
									type: "text",
									className: "br-mono",
									value: v.jira_base,
									placeholder: "https://jira.example.com",
									onChange: (e) => M({ jira_base: e.target.value })
								})]
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [/* @__PURE__ */ h("label", {
									htmlFor: "imp-gl-base",
									children: "GitLab 地址"
								}), /* @__PURE__ */ h("input", {
									id: "imp-gl-base",
									type: "text",
									className: "br-mono",
									value: v.gitlab_base,
									placeholder: "https://gitlab.example.com",
									onChange: (e) => M({ gitlab_base: e.target.value })
								})]
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [
									/* @__PURE__ */ h("label", {
										htmlFor: "imp-gl-project",
										children: "GitLab 项目"
									}),
									/* @__PURE__ */ h("input", {
										id: "imp-gl-project",
										type: "text",
										className: "br-mono",
										value: v.gitlab_project,
										placeholder: "组/仓库",
										onChange: (e) => M({ gitlab_project: e.target.value })
									}),
									/* @__PURE__ */ h("p", {
										className: "br-hint",
										children: L ? "按远端的地址猜的：检查一下。" : "交接和开 MR 用。不用 GitLab 就两个都空着。"
									})
								]
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [/* @__PURE__ */ h("label", {
									htmlFor: "imp-default",
									children: "默认分支"
								}), /* @__PURE__ */ h("input", {
									id: "imp-default",
									type: "text",
									className: "br-mono",
									value: v.default_branch,
									onChange: (e) => M({ default_branch: e.target.value })
								})]
							}),
							/* @__PURE__ */ g("div", {
								className: "br-field",
								children: [/* @__PURE__ */ h("label", {
									htmlFor: "imp-team",
									children: "团队（可不填）"
								}), /* @__PURE__ */ h("input", {
									id: "imp-team",
									type: "text",
									value: v.team,
									onChange: (e) => M({ team: e.target.value })
								})]
							}),
							A === "branch" && /* @__PURE__ */ g("div", {
								className: "br-field",
								children: [/* @__PURE__ */ h("label", {
									htmlFor: "imp-branch",
									children: "新分支名"
								}), /* @__PURE__ */ h("input", {
									id: "imp-branch",
									type: "text",
									className: "br-mono",
									value: S,
									onChange: (e) => C(e.target.value)
								})]
							})
						]
					}), /* @__PURE__ */ g("aside", {
						className: "imp-preview",
						"aria-label": "会写进这个仓库的 brain-kit 设置",
						children: [
							/* @__PURE__ */ g("span", {
								className: "imp-preview-head",
								children: [/* @__PURE__ */ h("b", {
									title: "写在这个仓库的 .brain/kit.json",
									children: "会写进这个仓库的 brain-kit 设置"
								}), !b && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("button", {
									type: "button",
									className: "br-btn is-small",
									onClick: () => x(!0),
									children: [/* @__PURE__ */ h($, {
										name: "Pencil",
										size: 13
									}), "改设置"]
								}), /* @__PURE__ */ g("small", {
									className: "br-hint",
									"data-testid": "install-guess",
									children: [
										"按这个仓库",
										L ? "的远端地址" : "",
										"猜的：对的话直接装；要改，点「改设置」。"
									]
								})] })]
							}),
							/* @__PURE__ */ h(Zu, { k: v }),
							A === "branch" && /* @__PURE__ */ g("div", {
								className: "imp-route",
								"aria-label": "新分支从哪来",
								children: [
									/* @__PURE__ */ h("code", { children: v.default_branch.trim() || "main" }),
									/* @__PURE__ */ h("span", {
										className: "imp-arrow",
										"aria-hidden": "true",
										children: "→"
									}),
									/* @__PURE__ */ h("code", {
										className: "is-new",
										children: S.trim() || "—"
									}),
									/* @__PURE__ */ g("small", { children: [e.origin ? "从远端的默认分支建新分支" : "新分支", "，单独的工作目录；合并以后才能开需求"] })
								]
							}),
							/* @__PURE__ */ g("div", {
								className: "imp-go",
								children: [/* @__PURE__ */ g("button", {
									type: "submit",
									className: "br-btn is-primary is-big",
									disabled: j.busy || !te?.ok && !!w || !v.req_prefix.trim() || !v.default_branch.trim() || A === "branch" && !S.trim(),
									children: [/* @__PURE__ */ h(Y, {
										role: A === "branch" ? "handover" : "commit",
										size: 17
									}), j.busy ? "正在开始…" : A === "branch" ? "安装到新分支" : T ? `改成直接装在 ${F}` : `直接装在 ${F}`]
								}), /* @__PURE__ */ g("p", {
									className: "imp-safe",
									"data-testid": "install-safe",
									children: [/* @__PURE__ */ h(Y, {
										role: "security",
										size: 18
									}), /* @__PURE__ */ h("span", { children: A === "branch" ? "只装在新分支上：从默认分支建，放在单独的工作目录里（设置里「每个需求的工作目录」下面）。你现在的检出、分支和改动都不动。提交用你自己的 git 身份，提交时跑的 git 检查照常跑。" : "只提交安装写的文件，你自己没提交的改动不碰；用你自己的 git 身份提交，提交时跑的 git 检查照常跑；不会自己推送。" })]
								})]
							}),
							j.error && /* @__PURE__ */ h("p", {
								className: "br-error",
								role: "alert",
								children: j.error
							})
						]
					})]
				})
			] }),
			t && /* @__PURE__ */ h(qu, {
				job: t,
				what: "安装",
				readError: r
			}),
			z && z.commit.ok && /* @__PURE__ */ h($u, {
				r: z,
				c: e,
				added: o,
				addBusy: s,
				addError: l,
				onAdd: d,
				onChanged: f,
				go: p
			}),
			z && /* @__PURE__ */ h(td, {
				r: z,
				onCommitted: a
			}),
			t && t.state === "failed" && /* @__PURE__ */ h("div", {
				className: "br-row",
				children: /* @__PURE__ */ h("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => i(null),
					children: "改一下再装"
				})
			})
		]
	});
}
function $u({ r: e, c: t, added: n, addBusy: r, addError: i, onAdd: a, onChanged: o, go: s }) {
	let [l, u] = c(!1), d = e.mode === "inplace", f = n?.id ?? t.listed, p = e.target || "默认分支", m = d ? null : t.pending, _ = d && (!e.remote_url || l), v = d ? `装好了，提交在 ${e.branch} 上` : `装在 ${e.branch} 分支上`, y = _ ? "现在就能开需求了。" : d ? `推送 ${e.branch} 以后就能开需求。` : `合进 ${p} 以后才能开需求。${m?.next && !m.mr_url ? `下一步：${m.next}。` : ""}`;
	return /* @__PURE__ */ g("div", {
		className: `imp-done${_ ? "" : " is-wait"}`,
		role: "status",
		"data-testid": "install-next",
		children: [
			/* @__PURE__ */ h("span", {
				className: "imp-mark",
				"aria-hidden": "true",
				children: _ ? "✓" : "✋"
			}),
			/* @__PURE__ */ g("div", { children: [
				/* @__PURE__ */ g("b", { children: [v, f ? "，已经加入列表" : ""] }),
				/* @__PURE__ */ h("small", { children: y }),
				!f && /* @__PURE__ */ g("span", {
					className: "br-row",
					children: [/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: r,
						onClick: a,
						children: [/* @__PURE__ */ h(Y, {
							role: "list",
							size: 14
						}), r ? "正在加入…" : "加入列表"]
					}), i && /* @__PURE__ */ h("span", {
						className: "br-error",
						role: "alert",
						children: i
					})]
				}),
				d && e.remote_url && /* @__PURE__ */ h(Dt, {
					path: e.path,
					branch: e.branch,
					remoteUrl: e.remote_url,
					target: e.target,
					onDone: () => u(!0)
				}),
				m && m.state === "branch" && m.remote_url && !m.mr_url && /* @__PURE__ */ h(id, {
					path: e.path,
					p: m,
					primary: !0,
					onDone: o
				}),
				m && (m.merge || m.pull || m.mr_url) && /* @__PURE__ */ h(Ot, {
					path: e.path,
					p: m,
					onDone: o
				}, `${m.state}:${m.branch}`)
			] }),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [_ && f && /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary",
					onClick: () => s({
						kind: "new",
						repo: f
					}),
					children: [/* @__PURE__ */ h(Y, {
						role: "new",
						size: 16
					}), "开需求"]
				}), /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn",
					onClick: () => s({ kind: "overview" }),
					children: [/* @__PURE__ */ h(Y, {
						role: "list",
						size: 16
					}), "去交付总览"]
				})]
			})
		]
	});
}
function ed({ o: e, on: t, rec: n, onPick: r }) {
	let i = `imp-mode-${e.mode}`;
	return /* @__PURE__ */ g("label", {
		className: `imp-option${t ? " is-on" : ""}${e.ok ? "" : " is-off"}`,
		"data-mode": e.mode,
		children: [
			/* @__PURE__ */ h("input", {
				type: "radio",
				name: "imp-mode",
				value: e.mode,
				checked: t,
				disabled: !e.ok,
				onChange: r,
				"aria-labelledby": `${i}-t`,
				"aria-describedby": `${i}-d`
			}),
			/* @__PURE__ */ h(Y, {
				role: e.mode === "branch" ? "handover" : "commit",
				size: 30
			}),
			/* @__PURE__ */ g("b", {
				id: `${i}-t`,
				children: [e.title, n && /* @__PURE__ */ h("span", {
					className: "br-chip tone-ok imp-rec",
					children: "推荐"
				})]
			}),
			/* @__PURE__ */ h("small", {
				id: `${i}-d`,
				children: e.ok ? e.line : e.why
			}),
			/* @__PURE__ */ h("span", {
				className: "imp-tick",
				"aria-hidden": "true",
				children: t ? "✓" : ""
			})
		]
	});
}
function td({ r: e, onCommitted: t }) {
	let n = u(), r = P(() => n.post(E.importCommit(), { path: e.path })), i = r.result ?? e.commit, a = async () => {
		(await r.run())?.ok && t();
	}, o = Ru.map((t) => [t, e.files.filter((e) => (Iu[e.change] ? e.change : "other") === t)]).filter(([, e]) => e.length > 0), s = e.doctor.rows.filter((e) => e.level === "OK"), c = e.mode === "inplace";
	return /* @__PURE__ */ g("div", {
		className: "imp-result",
		"data-testid": "install-result",
		children: [
			/* @__PURE__ */ g("dl", {
				className: "imp-facts",
				children: [
					c ? /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "提交在" }), /* @__PURE__ */ g("dd", { children: [/* @__PURE__ */ h("code", { children: e.branch }), "（你现在的检出）"] })] }) : /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "新分支" }), /* @__PURE__ */ g("dd", { children: [/* @__PURE__ */ h("code", { children: e.branch }), e.base ? `（从${e.base.startsWith("origin/") ? `远端的 ${e.base.slice(7)}` : ` ${e.base}`} 建）` : ""] })] }),
					e.worktree && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "工作目录" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("code", { children: e.worktree }) })] }),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "brain-kit 设置" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h(Zu, { k: e.kit }) })] })
				]
			}),
			i.ok ? /* @__PURE__ */ g("div", {
				className: "imp-commit is-ok",
				"data-testid": "commit-ok",
				children: [/* @__PURE__ */ h("span", {
					className: "imp-mark",
					"aria-hidden": "true",
					children: "✓"
				}), /* @__PURE__ */ h("div", { children: /* @__PURE__ */ h("b", {
					className: "br-pre",
					children: i.text
				}) })]
			}) : i.text ? /* @__PURE__ */ g("div", {
				className: "imp-commit is-bad",
				role: "alert",
				"data-testid": "commit-blocked",
				children: [/* @__PURE__ */ h("span", {
					className: "imp-mark",
					"aria-hidden": "true",
					children: "✕"
				}), /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("p", {
					className: "br-pre",
					children: i.text
				}), /* @__PURE__ */ h("div", {
					className: "br-row",
					children: /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: r.busy,
						onClick: () => void a(),
						children: [/* @__PURE__ */ h(Y, {
							role: "commit",
							size: 16
						}), r.busy ? "正在提交…" : "再提交一次"]
					})
				})] })]
			}) : null,
			r.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: r.error
			}),
			e.doctor.ran && /* @__PURE__ */ g("div", {
				className: "imp-block",
				"data-testid": "doctor",
				children: [/* @__PURE__ */ g("div", {
					className: "imp-block-head",
					children: [
						/* @__PURE__ */ h(Y, {
							role: "ci",
							size: 18
						}),
						/* @__PURE__ */ h("b", { children: "自检" }),
						/* @__PURE__ */ h(Yu, { levels: e.doctor.rows.map((e) => e.level) })
					]
				}), e.doctor.rows.length > 0 ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h(xt, {
					rows: e.doctor.rows,
					only: ["FAIL", "WARN"]
				}), s.length > 0 && /* @__PURE__ */ g("details", {
					className: "imp-more",
					children: [/* @__PURE__ */ h("summary", { children: s.length === e.doctor.rows.length ? `${s.length} 项都正常` : `另外 ${s.length} 项正常` }), /* @__PURE__ */ h(xt, { rows: s })]
				})] }) : /* @__PURE__ */ h("p", {
					className: "br-note",
					children: "自检没给出结果：原始输出在下面的「细节」里。"
				})]
			}),
			e.files.length > 0 && /* @__PURE__ */ g("details", {
				className: "imp-more imp-block",
				"data-testid": "files",
				children: [/* @__PURE__ */ h("summary", { children: /* @__PURE__ */ h("b", { children: c ? `提交了 ${e.files.length} 个文件` : `改了 ${e.files.length} 个文件` }) }), /* @__PURE__ */ h("div", {
					className: "imp-files",
					"data-testid": "changed-files",
					children: o.map(([e, t]) => /* @__PURE__ */ g("div", {
						className: "imp-fgroup",
						"data-change": e,
						children: [/* @__PURE__ */ g("span", {
							className: `br-chip kt-pill tone-${Lu[e]}`,
							children: [
								Iu[e],
								" ",
								/* @__PURE__ */ h("b", { children: t.length })
							]
						}), /* @__PURE__ */ h("ul", { children: t.map((e) => /* @__PURE__ */ h("li", {
							className: "br-tag br-mono",
							children: e.path
						}, e.path)) })]
					}, e))
				})]
			}),
			(e.output || e.doctor.output) && /* @__PURE__ */ g("details", {
				className: "imp-more",
				children: [/* @__PURE__ */ h("summary", { children: "细节：安装和自检时 brain-kit 的原话" }), /* @__PURE__ */ h("pre", {
					className: "br-findings",
					children: [e.output, e.doctor.output].filter(Boolean).join("\n\n")
				})]
			})
		]
	});
}
var nd = {
	branch: "在分支上",
	uncommitted: "还没提交",
	merged: "要拉取"
};
function rd({ path: e, p: t, onChanged: n }) {
	let r = u(), i = P(() => r.post(E.importCommit(), { path: e }));
	return /* @__PURE__ */ g("section", {
		className: "br-card imp-sec is-wait",
		"aria-label": "装在新分支上",
		"data-testid": "pending",
		children: [
			/* @__PURE__ */ h(Uu, {
				n: 3,
				title: t.state === "merged" ? `已经合进 ${t.target || "默认分支"}` : "装在新分支上",
				state: t.state === "uncommitted" ? "wait" : "done"
			}),
			/* @__PURE__ */ g("div", {
				className: "imp-pend",
				children: [
					/* @__PURE__ */ g("span", {
						className: "br-chip kt-pill tone-wait is-live",
						children: [/* @__PURE__ */ h("i", {
							"aria-hidden": "true",
							children: "✋"
						}), t.word || nd[t.state]]
					}),
					/* @__PURE__ */ h("b", { children: t.text }),
					t.commit && /* @__PURE__ */ h("code", {
						className: "br-tag",
						title: "提交",
						children: t.commit.slice(0, 8)
					})
				]
			}),
			(t.worktree || t.next) && /* @__PURE__ */ g("dl", {
				className: "imp-facts",
				children: [t.worktree && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "工作目录" }), /* @__PURE__ */ h("dd", { children: /* @__PURE__ */ h("code", { children: t.worktree }) })] }), t.next && /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "下一步" }), /* @__PURE__ */ h("dd", { children: t.next })] })]
			}),
			t.state === "uncommitted" && /* @__PURE__ */ g("div", {
				className: "br-row",
				children: [
					/* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-primary",
						disabled: i.busy,
						onClick: async () => {
							(await i.run())?.ok && n();
						},
						children: [/* @__PURE__ */ h(Y, {
							role: "commit",
							size: 16
						}), i.busy ? "正在提交…" : "再提交一次"]
					}),
					i.result && !i.result.ok && /* @__PURE__ */ h("p", {
						className: "br-bad-text br-pre",
						role: "alert",
						children: i.result.text
					}),
					i.error && /* @__PURE__ */ h("p", {
						className: "br-error",
						role: "alert",
						children: i.error
					})
				]
			}),
			(t.merge || t.pull || t.mr_url) && /* @__PURE__ */ h(Ot, {
				path: e,
				p: t,
				onDone: n
			}, `${t.state}:${t.branch}`),
			t.state === "branch" && t.remote_url && !t.mr_url && /* @__PURE__ */ h(id, {
				path: e,
				p: t,
				primary: !0,
				onDone: n
			})
		]
	});
}
function id({ path: e, p: t, primary: n = !1, onDone: r }) {
	let i = u(), [a, o] = c(!1), s = P((e) => i.post(E.importPublish(), e)), l = s.result, d = async () => {
		let n = await s.run({
			path: e,
			branch: t.branch,
			target: t.target,
			remote_url: t.remote_url,
			confirm: !0
		});
		n && (o(!1), n.ok && r());
	};
	return /* @__PURE__ */ g("div", {
		className: "imp-block",
		children: [
			!a && (!l || !l.ok) && /* @__PURE__ */ g("div", {
				className: "br-row",
				children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: `br-btn${n ? " is-primary" : ""}`,
					onClick: () => o(!0),
					children: [/* @__PURE__ */ h(Y, {
						role: "pr",
						size: 16
					}), l ? "再试一次" : t.pushed ? "再推送一次并开 MR" : "推送并开 MR"]
				}), /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: "把这个分支推到远端，在 GitLab 上开 MR；MR 合并以后点「拉取」，就能开需求。"
				})]
			}),
			a && /* @__PURE__ */ g("div", {
				className: "br-confirm imp-confirm",
				role: "group",
				"aria-label": "确认推送",
				"data-testid": "publish-confirm",
				children: [
					/* @__PURE__ */ g("span", {
						className: "imp-confirm-head",
						children: [/* @__PURE__ */ h(Y, {
							role: "pr",
							size: 18
						}), /* @__PURE__ */ h("b", { children: "推送之前确认一下" })]
					}),
					/* @__PURE__ */ g("p", { children: [
						"会把分支 ",
						/* @__PURE__ */ h("code", { children: t.branch }),
						" 推到远端（",
						/* @__PURE__ */ h("code", { children: t.remote_url }),
						"）",
						t.gitlab_project ? /* @__PURE__ */ g(m, { children: [
							"，再在 GitLab 的 ",
							/* @__PURE__ */ h("code", { children: t.gitlab_project }),
							" 上开 MR：",
							/* @__PURE__ */ h("code", { children: t.branch }),
							" → ",
							/* @__PURE__ */ h("code", { children: t.target }),
							"。"
						] }) : "。这个仓库的 brain-kit 设置没写 GitLab 项目：MR 要你自己开。"
					] }),
					t.gitlab_project && !t.can_open_mr && /* @__PURE__ */ h("p", {
						className: "br-hint",
						children: "这台机器上没有 GitLab 令牌：只推送，MR 用给出的命令或链接自己开。"
					}),
					/* @__PURE__ */ g("div", {
						className: "br-row",
						children: [/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-primary",
							disabled: s.busy,
							onClick: () => void d(),
							children: s.busy ? "正在推送…" : "确定推送"
						}), /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn",
							disabled: s.busy,
							onClick: () => o(!1),
							children: "取消"
						})]
					})
				]
			}),
			s.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: s.error
			}),
			l && /* @__PURE__ */ h(ad, { r: l })
		]
	});
}
function ad({ r: e }) {
	let [t, n] = c(""), r = e.pushed ? e.commands.slice(1) : e.commands, i = async () => {
		try {
			await navigator.clipboard.writeText(r.join("\n")), n("已复制");
		} catch {
			n("没复制成：请手动选中");
		}
	};
	return /* @__PURE__ */ g("div", {
		className: `imp-commit ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "publish-result",
		children: [/* @__PURE__ */ h("span", {
			className: "imp-mark",
			"aria-hidden": "true",
			children: e.ok ? "✓" : "✕"
		}), /* @__PURE__ */ g("div", { children: [
			/* @__PURE__ */ h("p", {
				className: "br-pre br-strong",
				role: "status",
				children: e.text
			}),
			e.mr && /* @__PURE__ */ h("p", { children: /* @__PURE__ */ g(dt, {
				href: e.mr.url,
				children: ["MR !", e.mr.iid]
			}) }),
			!e.mr && /* @__PURE__ */ g(m, { children: [e.new_mr_url && /* @__PURE__ */ h("p", { children: /* @__PURE__ */ h(dt, {
				href: e.new_mr_url,
				children: "在 GitLab 上开 MR"
			}) }), r.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-stack",
				style: { gap: 4 },
				children: [
					/* @__PURE__ */ h("span", {
						className: "br-hint",
						children: e.pushed ? "或者在终端里开 MR：" : "在终端里自己做："
					}),
					/* @__PURE__ */ h("pre", {
						className: "br-findings",
						"data-testid": "commands",
						children: r.join("\n")
					}),
					/* @__PURE__ */ g("div", {
						className: "br-row",
						children: [/* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn is-small",
							onClick: () => void i(),
							children: [/* @__PURE__ */ h($, {
								name: "Copy",
								size: 13
							}), "复制"]
						}), t && /* @__PURE__ */ h("span", {
							className: "br-small br-dim",
							role: "status",
							children: t
						})]
					})
				]
			})] }),
			e.output && /* @__PURE__ */ g("details", {
				className: "imp-more",
				children: [/* @__PURE__ */ h("summary", { children: "细节：推送时 git 的原话" }), /* @__PURE__ */ h("pre", {
					className: "br-findings",
					children: e.output
				})]
			})
		] })]
	});
}
function od({ pending: e, state: t, result: n, busy: r, error: i, onAdd: a, go: o }) {
	let s = n?.status.repos.find((e) => e.id === n.id);
	return /* @__PURE__ */ g("section", {
		className: `br-card imp-sec${n ? " is-ok" : ""}`,
		"aria-label": "加入列表",
		"data-testid": "add",
		children: [
			/* @__PURE__ */ h(Uu, {
				n: 4,
				title: "加入列表",
				state: t,
				sub: e ? "合并以后才能开需求" : "最后一步"
			}),
			!n && /* @__PURE__ */ g("div", {
				className: "imp-final",
				children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: `br-btn is-big${e ? "" : " is-primary"}`,
					disabled: r,
					onClick: a,
					children: [/* @__PURE__ */ h(Y, {
						role: "list",
						size: 18
					}), r ? "正在加入…" : e ? "先加入列表" : "加入列表"]
				}), /* @__PURE__ */ h("span", {
					className: "br-hint",
					children: e ? `加入以后，列表里这个仓库会显示「${e.text}」；合并以后才能开需求。` : "加入以后，交付总览和开需求就能用它。"
				})]
			}),
			n && /* @__PURE__ */ g("div", {
				className: "imp-done",
				role: "status",
				"data-testid": "added",
				children: [
					/* @__PURE__ */ h("span", {
						className: "imp-mark",
						"aria-hidden": "true",
						children: "✓"
					}),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", { children: n.text }), /* @__PURE__ */ h("small", { children: s?.ok ? "现在就能开需求了。" : s?.pending?.next ?? "装好以后就能用。" })] }),
					/* @__PURE__ */ g("div", {
						className: "br-row",
						children: [s?.ok && /* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn is-primary",
							onClick: () => o({
								kind: "new",
								repo: n.id
							}),
							children: [/* @__PURE__ */ h(Y, {
								role: "new",
								size: 16
							}), "开需求"]
						}), /* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn",
							onClick: () => o({ kind: "overview" }),
							children: [/* @__PURE__ */ h(Y, {
								role: "list",
								size: 16
							}), "去交付总览"]
						})]
					})
				]
			}),
			i && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: i
			})
		]
	});
}
var sd = "\n.imp-root { container: imp / inline-size; }\n.imp-hero { gap: 16px; padding: 22px 26px; }\n.imp-hero h2 { margin-bottom: 4px; }\n.imp-sec { gap: 14px; }\n.imp-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }\n.imp-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }\n.imp-head small { color: var(--muted); font-size: .88em; }\n.imp-head .imp-end { margin-left: auto; }\n.imp-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;\n  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }\n.imp-n.is-done { background: var(--kt-ok-solid); color: #fff; }\n.imp-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }\n.imp-n.is-bad { background: var(--kt-bad-solid); color: #fff; }\n.imp-n.is-wait { background: var(--kt-approve); color: var(--kt-on); }\n.imp-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }\n.imp-path { padding: 2px 9px; border-radius: 8px; border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); font-size: .86em; word-break: break-all; }\n.imp-counts { display: inline-flex; gap: 5px; flex-wrap: wrap; }\n\n/* 从哪来: two big option cards */\n.imp-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }\n@container imp (max-width: 760px) { .imp-options { grid-template-columns: minmax(0, 1fr); } }\n.imp-option { position: relative; display: grid; grid-template-columns: 46px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 2px; align-items: center;\n  padding: 14px 44px 14px 18px; border-radius: 14px; border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); cursor: pointer; transition: border-color .15s, box-shadow .15s; }\n.imp-option:hover { border-color: var(--accent); }\n.imp-option input { position: absolute; opacity: 0; width: 1px; height: 1px; margin: 0; }\n.imp-option:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.imp-option > .kt-role-icon { grid-row: span 2; justify-self: center; color: var(--text-strong); opacity: .8; }\n.imp-option b { font-size: 1.1em; font-weight: 800; color: var(--text-strong); }\n.imp-option small { color: var(--muted); font-size: .88em; }\n.imp-option.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 9%, var(--card)); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 32%, transparent); }\n.imp-option.is-on > .kt-role-icon { color: var(--accent); opacity: 1; }\n.imp-option.is-off { opacity: .62; cursor: not-allowed; }\n.imp-option.is-off small { color: var(--kt-warn); }\n.imp-rec { margin-left: 8px; vertical-align: 2px; font-size: .78em; }\n.imp-where { margin: 0; display: flex; align-items: baseline; gap: 6px 10px; flex-wrap: wrap; }\n.imp-where b { color: var(--text-strong); font-weight: 800; }\n.imp-where span { color: var(--muted); font-size: .92em; }\n.imp-where .kt-role-icon { align-self: center; color: var(--kt-ok); }\n.imp-tick { position: absolute; top: 50%; right: 16px; transform: translateY(-50%); width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center;\n  border: 2px solid var(--border-strong, var(--border)); font-size: 11px; font-weight: 900; }\n.imp-option.is-on .imp-tick { background: var(--accent); border-color: var(--accent); color: var(--accent-fg, #fff); }\n.imp-local, .imp-clone { display: grid; gap: 12px; }\n.imp-inline { display: flex; gap: 10px; align-items: stretch; flex-wrap: wrap; }\n.imp-inline input { flex: 1 1 24em; min-width: 0; }\n.imp-stale { margin: 0; display: inline-flex; align-items: center; gap: 8px; color: var(--kt-warn); font-weight: 700; }\n.imp-stale i { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 6px; border: 2px solid var(--kt-warn); font-size: .8em; }\n.imp-found { display: grid; gap: 6px; }\n.imp-found ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 19em), 1fr)); gap: 6px; }\n.imp-found-btn { width: 100%; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 10px; cursor: pointer; text-align: left;\n  border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); font: inherit; min-width: 0; }\n.imp-found-btn:hover:not(:disabled) { border-color: var(--accent); }\n.imp-found-btn b { color: var(--text-strong); white-space: nowrap; }\n.imp-found-btn code { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: .84em; }\n.imp-found-btn .br-chip { flex: none; font-size: .78em; }\n.imp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-content: start; align-items: start; }\n.imp-grid > .br-field { align-content: start; }\n.imp-grid > .is-full { grid-column: 1 / -1; }\n@container imp (max-width: 760px) { .imp-grid { grid-template-columns: minmax(0, 1fr); } }\n.imp-grid :is(input[type=\"text\"], input:not([type]), select) { width: 100%; }\n\n/* 检查: one row per check, two columns */\n.imp-checks { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 10px; align-items: stretch; }\n@container imp (max-width: 960px) { .imp-checks { grid-template-columns: minmax(0, 1fr); } }\n.imp-check { display: grid; grid-template-columns: 26px minmax(0, 1fr); gap: 3px 10px; align-items: start; align-content: start; padding: 9px 12px; border-radius: 12px;\n  border: 1px solid var(--border); background: var(--kt-glass); }\n.imp-check.is-FAIL { border-color: color-mix(in srgb, var(--kt-bad) 50%, var(--border)); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }\n.imp-check.is-WARN { border-color: color-mix(in srgb, var(--kt-warn) 50%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 6%, transparent); }\n.imp-check.is-next { border-color: color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 6%, transparent); }\n.imp-glyph { grid-row: span 2; width: 24px; height: 24px; display: grid; place-items: center; border-radius: 8px; font-weight: 900; font-size: 13px;\n  color: var(--kt-tone); border: 2px solid var(--kt-tone); background: color-mix(in srgb, var(--kt-tone) 14%, transparent); }\n.imp-check.is-OK .imp-glyph { background: var(--kt-ok-solid); border-color: var(--kt-ok-solid); color: #fff; }\n.imp-check-main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 10px; min-width: 0; padding-top: 2px; }\n.imp-check-main b { color: var(--text-strong); font-weight: 750; white-space: nowrap; }\n.imp-check-main span { color: var(--text); word-break: break-word; }\n.imp-check.is-OK .imp-check-main span { color: var(--muted); }\n.imp-todo { grid-column: 2; font-size: .9em; color: var(--text); }\n.imp-todo.is-box { padding-top: 4px; }\n.imp-todo b { color: var(--muted); font-weight: 650; margin-right: 6px; }\n.imp-block { display: grid; gap: 8px; }\n/* 「另外 N 项正常」 sits on its block's head line while closed, so after 检查 the install button is on the first screen\n   at 1050 (SETUP-18); opened, it takes its own row under the rows it adds to */\n.imp-inspect, .imp-block { grid-template-columns: minmax(0, 1fr) auto; }\n.imp-inspect > *, .imp-block > * { grid-column: 1 / -1; }\n.imp-inspect > .imp-head, .imp-block > .imp-block-head { grid-column: 1; grid-row: 1; }\n.imp-inspect > .imp-fold:not([open]), .imp-block > .imp-fold:not([open]) { grid-column: 2; grid-row: 1; align-self: center; }\n@container imp (max-width: 760px) { .imp-inspect > .imp-fold:not([open]), .imp-block > .imp-fold:not([open]) { grid-column: 1 / -1; grid-row: auto; } }\n.imp-block-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.imp-block-head > .kt-role-icon { color: var(--text-strong); opacity: .85; }\n.imp-block-head b { color: var(--text-strong); font-weight: 750; }\n.imp-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--kt-bad);\n  background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }\n\n/* 安装: the field grid and its live preview */\n.imp-install { display: grid; grid-template-columns: minmax(0, 1fr); gap: 18px; align-items: start; }\n.imp-install.is-editing { grid-template-columns: minmax(0, 1.6fr) minmax(300px, 1fr); }\n@container imp (max-width: 1060px) { .imp-install.is-editing { grid-template-columns: minmax(0, 1fr); } }\n.imp-seg { display: flex; flex-wrap: wrap; gap: 6px; }\n.imp-opt { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px 6px 9px; border-radius: 999px; cursor: pointer; font-size: .92em; font-weight: 650;\n  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }\n.imp-opt input { margin: 0; accent-color: var(--accent); }\n.imp-opt:hover { border-color: var(--accent); }\n.imp-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }\n.imp-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.imp-preview { display: grid; gap: 12px; padding: 14px 16px; border-radius: 14px; border: 1px dashed color-mix(in srgb, var(--kt-info) 55%, var(--border));\n  background: color-mix(in srgb, var(--kt-info) 5%, var(--card)); }\n.imp-preview-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }\n.imp-preview-head > b { color: var(--text-strong); font-weight: 750; }\n.imp-preview-head > .br-hint { margin: 0; }\n.imp-kv { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }\n.imp-kv li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 10px; border-radius: 10px;\n  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }\n.imp-kv small { color: var(--muted); font-size: .82em; font-weight: 650; }\n.imp-kv b { color: var(--text-strong); font-weight: 750; font-family: var(--mono, ui-monospace, monospace); font-size: .92em; }\n.imp-kv li.is-empty { border-style: dashed; background: none; }\n.imp-kv li.is-empty b { color: var(--muted); font-weight: 500; }\n.imp-route { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }\n.imp-route code { padding: 3px 9px; border-radius: 8px; border: 1px solid var(--border-strong, var(--border)); background: var(--bg); font-weight: 700; color: var(--text-strong); }\n.imp-route code.is-new { border-color: var(--kit-ok); color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 9%, transparent); }\n.imp-route small { color: var(--muted); font-size: .84em; }\n.imp-arrow { color: var(--kt-handoff); font-weight: 900; }\n.imp-go { display: flex; align-items: center; gap: 10px 18px; flex-wrap: wrap; }\n.imp-go > .br-btn { flex: none; }\n.imp-go > .imp-safe { flex: 1 1 22em; }\n.imp-sum { display: inline-flex; vertical-align: middle; }\n.imp-safe { margin: 0; display: grid; grid-template-columns: 20px minmax(0, 1fr); gap: 8px; font-size: .88em; color: var(--text); line-height: 1.55; }\n.imp-safe .kt-role-icon { color: var(--kt-ok); margin-top: 1px; }\n\n/* a job: its state, its time, its steps */\n.imp-job { display: grid; gap: 8px; padding: 12px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-tone) 45%, var(--border)); background: var(--kt-glass); }\n.imp-job.tone-run { box-shadow: 0 0 0 2px color-mix(in srgb, var(--kt-run) 14%, transparent); }\n.imp-job-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }\n.imp-elapsed { margin-left: auto; color: var(--muted); font-variant-numeric: tabular-nums; font-size: .9em; }\n\n/* the install's result */\n.imp-result { display: grid; gap: 14px; }\n.imp-facts { display: grid; grid-template-columns: repeat(3, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }\n@container imp (max-width: 1060px) { .imp-facts { grid-template-columns: minmax(0, 1fr); } }\n.imp-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }\n.imp-facts dd { margin: 3px 0 0; color: var(--text); word-break: break-word; }\n.imp-facts code { color: var(--text-strong); font-weight: 650; }\n.imp-files { display: grid; gap: 8px; }\n.imp-fgroup { display: grid; grid-template-columns: 6.5em minmax(0, 1fr); gap: 8px; align-items: start; }\n.imp-fgroup > .kt-pill { justify-self: start; }\n.imp-fgroup ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 5px; }\n.imp-fgroup li { font-size: .8em; }\n.imp-commit { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 12px; }\n.imp-commit.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); }\n.imp-commit.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }\n.imp-commit > div { display: grid; gap: 8px; min-width: 0; flex: 1; }\n.imp-commit p { margin: 0; }\n.imp-commit b { color: var(--text-strong); font-weight: 750; }\n.imp-mark { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; font-weight: 900; color: #fff; background: var(--kt-ok-solid); }\n.imp-commit.is-bad .imp-mark { background: var(--kt-bad-solid); }\n.imp-more > summary { cursor: pointer; color: var(--muted); font-size: .9em; }\n.imp-more > summary b { color: var(--text-strong); font-weight: 750; }\n.imp-more[open] > summary { margin-bottom: 8px; }\n\n/* pending, publish, the last step */\n.imp-pend { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }\n.imp-pend b { color: var(--text-strong); font-weight: 750; font-size: 1.05em; }\n.imp-confirm { border-color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 8%, var(--card)); }\n.imp-confirm p { margin: 0; }\n.imp-confirm-head { display: inline-flex; align-items: center; gap: 8px; color: var(--kt-approve); }\n.imp-confirm-head b { color: var(--text-strong); }\n.imp-final { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }\n.imp-done { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 14px 18px; border-radius: 14px; border: 1px solid var(--kit-ok);\n  background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }\n.imp-done.is-wait { align-items: flex-start; border-color: var(--kit-wait);\n  background: radial-gradient(70% 140% at 0% 0%, color-mix(in srgb, var(--kt-approve) 12%, transparent), transparent 60%), var(--card); }\n.imp-done.is-wait .imp-mark { background: var(--kt-approve); box-shadow: none; }\n.imp-done .imp-mark { width: 40px; height: 40px; border-radius: 12px; font-size: 1.3em; box-shadow: 0 0 24px -6px var(--kt-ok); }\n.imp-done > div:not(.br-row) { display: grid; gap: 6px; flex: 1 1 14em; min-width: 0; }\n.imp-done b { font-size: 1.2em; font-weight: 850; color: var(--text-strong); }\n.imp-done small { color: var(--muted); }\n.imp-done .br-confirm b, .imp-done .imp-block b { font-size: 1em; }\n", cd = /^[a-z0-9][a-z0-9-]{0,39}$/, ld = "证件号、电话、卡号、邮箱：整份打码。标签后面、姓名列里的人名：在找到的地方打码。看不准是人名（或密码）还是普通词的不打码，列在「请你确认」里。", ud = "密钥打码。私钥和云访问密钥：整份不收。", dd = "认领一个需求，带上它的文档开工。文档先过五关，原件不进任何仓库。开工时在它自己的工作目录里开一个 AI 开发会话（brain-dev），按 AI-DLC Lean 的步骤（需求 → 设计 → 代码 → 测试 → 发布）一步步做，需求和设计由你批准", fd = `${dd}；团队仓库做完可以交给运行机（团队的服务器）接着跑。`, pd = `${dd}，做完在这台机器上发布、合并。`, md = "绝密材料不收：先请产品写一份脱敏摘要，交摘要。", hd = "只检查：不认领，文档也不收进任何地方。", gd = "KiroCrew 的检查都过了：开工以后能开会话。", _d = "打开会话：AI 先写需求文档；写好会请你批准（待办和需求看板会提醒，批准那一行要你在会话里自己打）。", vd = Object.keys(y), yd = {
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
function bd(e) {
	let t = /^\s*(?:第\s*(\d)\s*关|门\s*(\d))/.exec(e);
	return t ? Number(t[1] ?? t[2]) : null;
}
function xd(e, t) {
	return e === "secret" ? md : t || e !== "confidential" && e !== "unsure" ? "" : `这个仓库不收机密材料（你选的是「${e === "unsure" ? "不确定" : "机密"}」）：先请产品写一份脱敏摘要，交摘要。`;
}
function Sd(e) {
	let t = [...e.matchAll(/「([^」]*)」/g)].map((e) => `「${e[1]}」`);
	return t.length ? t.join("、") : e.replace(/^\s*D\d+\s+/, "").replace(/（[^）]*）/g, "").trim();
}
function Cd(e, t) {
	let n = e.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
	if (cd.test(n)) return n;
	let r = /-(\d+)$/.exec(t)?.[1];
	return r ? `req-${r}` : "";
}
var wd = (e) => /点「([^」]{2,20})」/.exec(e.todo ?? "")?.[1] ?? "";
function Td({ entry: e, ...t }) {
	let n = u(), r = f(), i = (t.status?.repos ?? []).filter((e) => e.ok), [a, o] = c(e.repo ?? ""), s = a && (!t.status || i.some((e) => e.id === a)) ? a : i[0]?.id ?? "", l = i.find((e) => e.id === s) ?? null, d = l?.me ?? null, p = l?.remote === !1, _ = e.key && (!e.repo || e.repo === s) ? e.key : "", v = N(s ? E.intakeNext(s) : null, 0), b = N(E.crew(), 0), [x, S] = c(""), [C, w] = c(e.title ?? ""), [T, D] = c(""), [O, k] = c(!1), [A, j] = c(""), [M, ee] = c(!1), [F, I] = c(""), [L, R] = c(""), [z, B] = c(!1), [V, ne] = c(""), [re, H] = c(""), [ie, ae] = c(""), [U, W] = c(!0), [G, oe] = c(!0), [se, ce] = c(!1), [le, ue] = c(!1), K = v.data && v.data.repo === s ? v.data : null, de = K?.key ?? "", q = _ || (M ? A : de), fe = O ? T : Cd(C, q), he = K?.tracker || l?.kit?.tracker || "none", ge = K?.allow_confidential !== !1, _e = vd.filter((e) => xd(e, ge)), ve = K?.big ?? null, J = se && !!ve?.ok, ye = {
		repo: s,
		key: q.trim(),
		slug: fe.trim(),
		title: C.trim(),
		docs: pe(L),
		consent: z,
		classification: V,
		business: re,
		exclude: pe(ie)
	}, be = JSON.stringify(ye), [xe, Se] = c(null), [Ce, we] = c(""), Te = P((e) => n.post(E.intakeCheck(), e)), Ee = P((e) => n.post(E.intakeStart(), e)), De = Ee.result, Oe = async () => {
		let e = be;
		Se(null), we("");
		let t = await Te.run(ye);
		t ? Se({
			print: e,
			result: t
		}) : we(e);
	}, ke = async () => {
		ue(J), await Ee.run({
			...ye,
			paths: me(F),
			open_session: U,
			trust: G,
			...J ? { big: !0 } : {}
		}) && t.reloadStatus();
	}, Ae = b.data ?? t.status?.crew ?? null, je = l?.path, X = (e) => e.filter((e) => (e.level === "FAIL" || e.level === "WARN") && (!e.repo || e.repo === je)), Me = Ae ? X(Ae.rows) : [], Ne = Me.some((e) => e.level === "FAIL"), Pe = Me.filter((e) => e.level === "FAIL").map(wd).find(Boolean), Fe = (e) => {
		b.data && b.set({
			...b.data,
			rows: e
		}), S(X(e).length ? "" : gd), t.reloadStatus();
	}, Ie = fe.trim() !== "" && !cd.test(fe.trim()), Le = q.trim() !== "" && !te.test(q.trim()), Re = he === "jira" && q.trim() === "", ze = (e) => e.ok && e.blocking.length === 0 && !e.error, Be = ye.docs.length === 0, Ve = !Be && !!V && _e.includes(V), He = xe && xe.print === be ? xe.result : null, Ue = s ? ye.title ? cd.test(ye.slug) ? Re ? "这个仓库用 Jira：要填需求号" : Le ? "需求号的格式不对" : d?.ask ? `先在上面「${d.label}」旁点「保存」${d.suggest ? `（确认是 ${d.suggest}）` : ""}` : De?.ok ? "已经开工了" : K?.push ? `先推送 ${K.push.branch}：开工从远端的 ${K.push.branch} 建分支，那里还没有 brain-kit` : U && Ne ? `KiroCrew 这边有问题，开不了会话：先点上面的${Pe ? `「${Pe}」` : "修复按钮"}，或者不勾「开工后开会话」` : Ve ? xd(V, ge) : Be ? "" : xe ? xe.print === be ? ze(xe.result) ? "" : "检查没过：照红色那几行改" : "表单改过了：再检查一遍" : "有文档：先检查一遍（不写入）" : "英文短名不对：英文小写、数字和 -" : "先写标题" : "先选一个仓库", We = Ue === "" && !Ee.busy, Ge = !!s && !Be && !Te.busy, Ke = !Be && !He && !De?.ok, qe = He ? [...He.blocking, He.error] : Ce === be ? [Te.error] : [], Je = /* @__PURE__ */ new Set();
	for (let e of qe) {
		let t = bd(e);
		t && Je.add(t);
	}
	Ve && Je.add(2);
	let Ye = qe.some((e) => e.includes("不收这些文件")), Xe = !!He && ze(He), $ = (e, t) => Be ? "off" : Je.has(e) ? "bad" : t ? "ok" : "wait", Ze = (e, t = !1) => Be ? "off" : Je.has(e) ? "bad" : t ? "warn" : Xe ? "ok" : "auto", Qe = [
		$(1, z),
		$(2, !!V),
		$(3, !!re),
		Ze(4, !!He?.review.length),
		Ze(5)
	], $e = (e, t) => e === "ok" ? Xe ? "过了" : "好了" : e === "wait" ? t : e === "bad" ? "拦下了" : e === "warn" ? "请你确认" : e === "auto" ? "自动" : "不用", et = !!s && !!ye.title && cd.test(ye.slug) && !Re && !Le && !d?.ask, tt = !!De?.ok, nt = !!He && !ze(He) || Ce === be || Ve, rt = [
		{
			icon: "new",
			title: "认领",
			text: _ ? `${_} 已经认领了` : "仓库、标题、需求号",
			state: tt || et ? "done" : "now"
		},
		{
			icon: "security",
			title: "文档过五关",
			text: Be ? "没有文档：不用过" : "原件不进任何仓库",
			state: Be ? "off" : tt || Xe ? "done" : nt ? "bad" : et ? "now" : void 0
		},
		{
			icon: "laptop",
			title: "开工",
			text: "在它自己的工作目录里开 AI 开发会话",
			state: tt ? "done" : De ? "bad" : We ? "now" : void 0
		},
		{
			icon: "req",
			title: "Lean 推进",
			text: J ? "需求和设计由你批准，设计里拆单元" : "需求和设计由你批准",
			state: tt ? "now" : void 0
		},
		...J ? [{
			icon: "scope",
			title: Q.split,
			text: "批了设计再拆，大家认领、并行做"
		}] : [],
		p ? {
			icon: "runner",
			title: "交给运行机",
			text: "这次不需要：这个仓库只在本机做",
			state: "off"
		} : {
			icon: "runner",
			title: "交给运行机",
			text: J ? "小需求都合并以后" : "团队仓库：交接以后它接着做"
		}
	], it = (e) => rt[e].state;
	if (t.status && i.length === 0) {
		let e = t.status.repos.filter((e) => e.pending), n = t.status.repos.filter((e) => !e.ok && !e.pending), r = t.status.brainkit, i = r.ok ? null : Kt(r.error, r.path);
		return /* @__PURE__ */ g("main", {
			className: "kt-root br-view nr-root",
			"data-testid": "br-new",
			children: [/* @__PURE__ */ h("style", { children: jd }), t.status.repos.length === 0 ? /* @__PURE__ */ h(Pt, {
				title: "开需求之前，先导入一个仓库",
				punch: "导入以后，就能在这里认领需求、开工。",
				onImport: () => t.go({ kind: "import" })
			}) : i ? /* @__PURE__ */ g("section", {
				className: "br-card nr-sec",
				"aria-label": "还没有能用的仓库",
				"data-testid": "no-usable-repo",
				children: [
					/* @__PURE__ */ g("header", {
						className: "nr-head",
						children: [
							/* @__PURE__ */ h(Y, {
								role: "blocked",
								size: 20,
								className: "nr-bad-icon"
							}),
							/* @__PURE__ */ h("h3", { children: "开不了需求：app 读不了 brain-kit" }),
							/* @__PURE__ */ g("small", { children: [t.status.repos.map((e) => e.name).join("、"), " 都在等它"] })
						]
					}),
					/* @__PURE__ */ g("p", {
						className: "nr-kit-todo",
						"data-testid": "no-kit-todo",
						children: [/* @__PURE__ */ h("b", { children: "做什么" }), i.kind === "missing" ? "先在设置里写对 brain-kit 的位置，点「保存」，这些仓库就能用了" : i.todo]
					}),
					/* @__PURE__ */ h("div", {
						className: "br-row",
						children: /* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn is-primary",
							onClick: () => t.go({ kind: "settings" }),
							children: [/* @__PURE__ */ h(Y, {
								role: "settings",
								size: 15
							}), i.kind === "missing" ? "去填位置" : "去设置"]
						})
					})
				]
			}) : /* @__PURE__ */ g("section", {
				className: "br-card nr-sec",
				"aria-label": "还没有能用的仓库",
				"data-testid": "no-usable-repo",
				children: [
					/* @__PURE__ */ g("header", {
						className: "nr-head",
						children: [
							/* @__PURE__ */ h(Y, {
								role: "blocked",
								size: 20,
								className: "nr-wait-icon"
							}),
							/* @__PURE__ */ h("h3", { children: "还没有能开需求的仓库" }),
							/* @__PURE__ */ h("small", { children: "做完下面这一步，就能在这里开需求" })
						]
					}),
					/* @__PURE__ */ g("ul", {
						className: "nr-waiting",
						children: [e.map((e) => /* @__PURE__ */ g("li", {
							"data-repo": e.id,
							children: [
								/* @__PURE__ */ h("b", { children: e.name }),
								/* @__PURE__ */ h("span", {
									className: "br-chip tone-wait",
									children: e.pending?.word || "在路上"
								}),
								/* @__PURE__ */ h(Ft, {
									repo: e,
									onOpen: () => t.go({
										kind: "import",
										path: e.path
									}),
									onDone: t.reloadStatus
								})
							]
						}, e.id)), n.map((e) => /* @__PURE__ */ g("li", {
							"data-repo": e.id,
							children: [
								/* @__PURE__ */ h("b", { children: e.name }),
								/* @__PURE__ */ h("span", {
									className: "br-chip tone-bad",
									children: "用不了"
								}),
								/* @__PURE__ */ h("span", {
									className: "br-small",
									children: e.error
								}),
								/* @__PURE__ */ h("button", {
									type: "button",
									className: "br-btn is-small nr-waiting-go",
									onClick: () => t.go({
										kind: "import",
										path: e.path
									}),
									children: "去导入仓库检查"
								})
							]
						}, e.id))]
					}),
					/* @__PURE__ */ h("div", {
						className: "br-row",
						children: /* @__PURE__ */ g("button", {
							type: "button",
							className: "br-btn",
							onClick: () => t.go({ kind: "import" }),
							children: [/* @__PURE__ */ h(Y, {
								role: "import",
								size: 15
							}), "导入别的仓库"]
						})
					})
				]
			})]
		});
	}
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view nr-root",
		"data-testid": "br-new",
		children: [
			/* @__PURE__ */ h("style", { children: jd }),
			/* @__PURE__ */ g("section", {
				className: "br-hero nr-hero",
				"aria-label": "开需求",
				children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("h2", { children: _ ? `开工：${_}` : "开需求" }), /* @__PURE__ */ h("p", { children: _ ? `${_} 已经认领了，还没开工。看一眼英文短名，有文档的话填上，点「开工」。` : p ? pd : fd })] }), /* @__PURE__ */ h(Bt, {
					steps: rt,
					label: "开需求的步骤"
				})]
			}),
			b.error && !Ae && /* @__PURE__ */ g("p", {
				className: "br-note",
				children: ["读不到 KiroCrew 的检查：", b.error]
			}),
			!Ae && b.loading && /* @__PURE__ */ h("p", {
				className: "br-note nr-crew-wait",
				role: "status",
				children: "正在查 KiroCrew…"
			}),
			Me.length > 0 && Ae && /* @__PURE__ */ g("section", {
				className: `br-card nr-crew ${Ne ? "is-bad" : "is-warn"}`,
				"aria-label": "KiroCrew 的检查",
				children: [/* @__PURE__ */ g("header", {
					className: "nr-head",
					children: [Ne ? /* @__PURE__ */ h(Y, {
						role: "blocked",
						size: 20,
						className: "nr-bad-icon"
					}) : /* @__PURE__ */ h("span", {
						className: "br-prob-glyph tone-warn",
						"aria-hidden": "true",
						children: "!"
					}), /* @__PURE__ */ h("h3", { children: Ne ? "开会话之前，KiroCrew 这边要先处理" : `KiroCrew 这边有 ${Me.length} 个提醒，不挡开工` })]
				}), /* @__PURE__ */ h(xt, {
					rows: Me,
					fix: Ae.fix,
					onFixed: Fe
				})]
			}),
			x && /* @__PURE__ */ h("div", {
				className: "br-banner is-ok",
				role: "status",
				children: x
			}),
			/* @__PURE__ */ g("form", {
				className: "nr-form",
				"aria-label": "开需求",
				onSubmit: (e) => e.preventDefault(),
				children: [
					/* @__PURE__ */ g("section", {
						className: "br-card nr-sec",
						"aria-label": "需求",
						children: [/* @__PURE__ */ h(Ed, {
							n: 1,
							title: "认领",
							state: it(0),
							sub: _ ? `${_} 已经认领了：需求号不能改` : "这个需求叫什么、放在哪个仓库"
						}), /* @__PURE__ */ g("div", {
							className: "nr-grid",
							children: [
								/* @__PURE__ */ g("div", {
									className: "br-field is-2",
									children: [/* @__PURE__ */ h("label", {
										htmlFor: "new-repo",
										children: "仓库"
									}), /* @__PURE__ */ h("select", {
										id: "new-repo",
										value: s,
										disabled: !!_,
										onChange: (e) => {
											o(e.target.value), ee(!1), j(""), t.replace({
												kind: "new",
												repo: e.target.value
											});
										},
										children: i.map((e) => /* @__PURE__ */ h("option", {
											value: e.id,
											children: Jt(e, i)
										}, e.id))
									})]
								}),
								/* @__PURE__ */ g("div", {
									className: "br-field is-4",
									children: [/* @__PURE__ */ h("label", {
										htmlFor: "new-title",
										children: "标题"
									}), /* @__PURE__ */ h("input", {
										id: "new-title",
										type: "text",
										value: C,
										placeholder: "商户结算周报",
										onChange: (e) => w(e.target.value)
									})]
								}),
								/* @__PURE__ */ g("div", {
									className: "br-field",
									children: [
										/* @__PURE__ */ h("label", {
											htmlFor: "new-slug",
											children: "英文短名（用在分支名里）"
										}),
										/* @__PURE__ */ h("input", {
											id: "new-slug",
											type: "text",
											className: "br-mono",
											value: fe,
											placeholder: "merchant-weekly",
											"aria-invalid": Ie ? !0 : void 0,
											"aria-describedby": "new-slug-hint",
											onChange: (e) => {
												D(e.target.value), k(!0);
											}
										}),
										/* @__PURE__ */ h("p", {
											className: "br-hint",
											id: "new-slug-hint",
											children: O ? "英文小写、数字和 -" : "按标题给了一个，可以改：英文小写、数字和 -"
										}),
										Ie && /* @__PURE__ */ h("p", {
											className: "br-error",
											role: "alert",
											children: "英文短名只能用英文小写、数字和 -，开头不能是 -，最多 40 个字。"
										})
									]
								}),
								/* @__PURE__ */ g("div", {
									className: "br-field",
									children: [
										/* @__PURE__ */ h("label", {
											htmlFor: "new-key",
											children: "需求号"
										}),
										/* @__PURE__ */ h("input", {
											id: "new-key",
											type: "text",
											className: "br-mono",
											value: q,
											readOnly: !!_,
											"aria-invalid": Le || Re ? !0 : void 0,
											onChange: (e) => {
												j(e.target.value), ee(!0);
											}
										}),
										/* @__PURE__ */ g("p", {
											className: "br-hint",
											children: [_ ? "已经认领的需求：开工就用这个号。" : he === "jira" ? "这个仓库用 Jira：填 Jira 上的需求号（必填）。" : "不填就用下一个空号。", !_ && de && !M ? `下一个空号是 ${de}。` : ""]
										}),
										v.error && /* @__PURE__ */ g("p", {
											className: "br-note",
											children: ["读不到下一个空号：", v.error]
										}),
										K?.error && /* @__PURE__ */ h("p", {
											className: "br-note",
											children: K.error
										}),
										Le && /* @__PURE__ */ h("p", {
											className: "br-error",
											role: "alert",
											children: "需求号的格式像 PAY-12。"
										})
									]
								}),
								/* @__PURE__ */ g("div", {
									className: "br-field is-full",
									children: [
										/* @__PURE__ */ h("label", {
											htmlFor: "new-paths",
											children: "预计会改的路径（用逗号、空格或换行分开）"
										}),
										/* @__PURE__ */ h("textarea", {
											id: "new-paths",
											rows: 2,
											value: F,
											placeholder: "src/refund/",
											onChange: (e) => I(e.target.value)
										}),
										/* @__PURE__ */ h("p", {
											className: "br-hint",
											children: "别的需求也改到这里时会提醒你。"
										})
									]
								}),
								ve && /* @__PURE__ */ g("div", {
									className: "br-field is-full nr-big",
									"data-testid": "new-big",
									children: [/* @__PURE__ */ g("label", {
										className: `nr-toggle${J ? " is-on" : ""}${ve.ok ? "" : " is-disabled"}`,
										children: [
											/* @__PURE__ */ h("input", {
												type: "checkbox",
												checked: J,
												disabled: !ve.ok,
												"aria-describedby": "new-big-hint",
												onChange: (e) => ce(e.target.checked)
											}),
											/* @__PURE__ */ h(Y, {
												role: "scope",
												size: 18
											}),
											/* @__PURE__ */ h("span", { children: "大需求：先拆成小需求" })
										]
									}), /* @__PURE__ */ g("p", {
										className: "br-hint",
										id: "new-big-hint",
										children: [Zt, !ve.ok && ve.why && /* @__PURE__ */ g("span", {
											className: "nr-big-why",
											"data-testid": "new-big-why",
											children: [/* @__PURE__ */ h("i", {
												"aria-hidden": "true",
												children: "✋"
											}), ve.why]
										})]
									})]
								}),
								l && d && /* @__PURE__ */ g("div", {
									className: "br-field is-full",
									"data-testid": "new-me",
									children: [!d.ask && /* @__PURE__ */ h("span", {
										className: "br-label",
										children: "认领人"
									}), /* @__PURE__ */ h(Rt, {
										path: l.path,
										me: d,
										onSaved: (e) => t.setStatus(e.status)
									}, l.id)]
								})
							]
						})]
					}),
					/* @__PURE__ */ g("section", {
						className: `br-card nr-sec${Be ? " is-quiet" : ""}`,
						"aria-label": "文档",
						children: [
							/* @__PURE__ */ h(Ed, {
								n: 2,
								title: "文档过五关",
								state: it(1),
								sub: Be ? "没有文档：五关都不用过，也不用检查" : "前三关你来定，后两关自动"
							}),
							/* @__PURE__ */ g("div", {
								className: "nr-grid",
								children: [/* @__PURE__ */ g("div", {
									className: "br-field is-4",
									children: [
										/* @__PURE__ */ h("label", {
											htmlFor: "new-docs",
											children: "文档（一行一个路径）"
										}),
										/* @__PURE__ */ h("textarea", {
											id: "new-docs",
											rows: 2,
											value: L,
											placeholder: "/Users/alice/Downloads/结算周报需求",
											onChange: (e) => R(e.target.value)
										}),
										/* @__PURE__ */ g("p", {
											className: "br-hint",
											children: ["这台机器上的文件或文件夹，飞书 / Lark 导出的文件夹也行。", Be ? "填了文档，下面就展开五关。" : ""]
										})
									]
								}), /* @__PURE__ */ g("div", {
									className: `br-field is-2${Ye ? " nr-hl" : ""}`,
									"data-marked": Ye || void 0,
									children: [/* @__PURE__ */ h("label", {
										htmlFor: "new-exclude",
										children: "不收这些文件（按文件名，可以用 *，一行一个）"
									}), /* @__PURE__ */ h("textarea", {
										id: "new-exclude",
										rows: 2,
										value: ie,
										placeholder: "*合作方*",
										onChange: (e) => ae(e.target.value)
									})]
								})]
							}),
							Be ? /* @__PURE__ */ g("p", {
								className: "nr-nodocs",
								"data-testid": "no-docs",
								children: [/* @__PURE__ */ h(Y, {
									role: "security",
									size: 16
								}), "没有文档：五关（同意、密级、金额公司名、个人信息、密钥）都不用过，可以直接开工。"]
							}) : /* @__PURE__ */ g(m, { children: [
								/* @__PURE__ */ g("ol", {
									className: "nr-gates",
									"aria-label": "五关",
									children: [
										/* @__PURE__ */ h(Dd, {
											n: 1,
											icon: "sign",
											title: "同意",
											state: Qe[0],
											word: $e(Qe[0], "等你勾"),
											children: /* @__PURE__ */ g("label", {
												className: `nr-opt${z ? " is-on" : ""}`,
												children: [/* @__PURE__ */ h("input", {
													type: "checkbox",
													checked: z,
													onChange: (e) => B(e.target.checked)
												}), /* @__PURE__ */ h("span", { children: "我是作者，或已取得作者同意" })]
											})
										}),
										/* @__PURE__ */ g(Dd, {
											n: 2,
											icon: "security",
											title: "密级",
											state: Qe[1],
											word: $e(Qe[1], "等你选"),
											children: [_e.includes("confidential") && /* @__PURE__ */ h("p", {
												className: "nr-gate-rule",
												"data-testid": "gate2-rule",
												children: "这个仓库不收机密材料：机密、绝密和「不确定」的文档，要先请产品写一份脱敏摘要，交摘要。"
											}), /* @__PURE__ */ h("div", {
												className: "nr-opts",
												role: "radiogroup",
												"aria-label": "第 2 关：密级",
												children: vd.map((e) => /* @__PURE__ */ g("label", {
													className: `nr-opt${V === e ? " is-on" : ""}${_e.includes(e) ? " is-refused" : ""}`,
													children: [
														/* @__PURE__ */ h("input", {
															type: "radio",
															name: "new-class",
															value: e,
															checked: V === e,
															onChange: () => ne(e)
														}),
														/* @__PURE__ */ h("span", { children: y[e] }),
														_e.includes(e) && /* @__PURE__ */ h("small", {
															className: "nr-no",
															children: "不收"
														})
													]
												}, e))
											})]
										}),
										/* @__PURE__ */ h(Dd, {
											n: 3,
											icon: "feasibility",
											title: "金额、公司名、合同号",
											state: Qe[2],
											word: $e(Qe[2], "等你选"),
											children: /* @__PURE__ */ g("div", {
												className: "nr-opts",
												role: "radiogroup",
												"aria-label": "第 3 关：金额、公司名、合同号",
												children: [/* @__PURE__ */ g("label", {
													className: `nr-opt${re === "keep" ? " is-on" : ""}`,
													children: [/* @__PURE__ */ h("input", {
														type: "radio",
														name: "new-business",
														value: "keep",
														checked: re === "keep",
														onChange: () => H("keep")
													}), /* @__PURE__ */ h("span", { children: "原样保留" })]
												}), /* @__PURE__ */ g("label", {
													className: `nr-opt${re === "mask" ? " is-on" : ""}`,
													children: [/* @__PURE__ */ h("input", {
														type: "radio",
														name: "new-business",
														value: "mask",
														checked: re === "mask",
														onChange: () => H("mask")
													}), /* @__PURE__ */ h("span", { children: "换成占位符" })]
												})]
											})
										}),
										/* @__PURE__ */ h(Dd, {
											n: 4,
											icon: "person",
											title: "个人信息：自动打码",
											state: Qe[3],
											word: $e(Qe[3], ""),
											children: /* @__PURE__ */ h("p", { children: ld })
										}),
										/* @__PURE__ */ h(Dd, {
											n: 5,
											icon: "signer",
											title: "密钥：自动打码",
											state: Qe[4],
											word: $e(Qe[4], ""),
											children: /* @__PURE__ */ h("p", { children: ud })
										})
									]
								}),
								/* @__PURE__ */ g("div", {
									className: "nr-go-row",
									children: [/* @__PURE__ */ g("button", {
										type: "button",
										className: `br-btn${Ke ? " is-primary" : ""}`,
										disabled: !Ge,
										onClick: () => void Oe(),
										children: [/* @__PURE__ */ h(Y, {
											role: "lint",
											size: 16
										}), Te.busy ? "正在检查…" : "先检查"]
									}), /* @__PURE__ */ h("span", {
										className: "br-hint",
										children: xe && xe.print !== be ? "表单改过了，这次检查不算数了。" : hd
									})]
								}),
								Te.error && /* @__PURE__ */ h("p", {
									className: "br-error",
									role: "alert",
									children: Te.error
								}),
								xe && /* @__PURE__ */ h(Od, {
									c: xe.result,
									stale: xe.print !== be
								})
							] })
						]
					}),
					/* @__PURE__ */ g("section", {
						className: `br-card nr-sec${tt ? " is-ok" : ""}`,
						"aria-label": "开工",
						children: [
							/* @__PURE__ */ h(Ed, {
								n: 3,
								title: "开工",
								state: it(2),
								sub: _ ? "建分支和工作目录、开会话" : "认领、建分支和工作目录、开会话"
							}),
							/* @__PURE__ */ g("div", {
								className: "nr-toggles",
								children: [/* @__PURE__ */ g("label", {
									className: `nr-toggle${U ? " is-on" : ""}`,
									children: [
										/* @__PURE__ */ h("input", {
											type: "checkbox",
											checked: U,
											onChange: (e) => W(e.target.checked)
										}),
										/* @__PURE__ */ h(Y, {
											role: "laptop",
											size: 18
										}),
										/* @__PURE__ */ h("span", { children: "开工后开会话：在这个需求的目录里开一个 AI 开发会话（brain-dev）" })
									]
								}), /* @__PURE__ */ g("label", {
									className: `nr-toggle${U && G ? " is-on" : ""}${U ? "" : " is-disabled"}`,
									children: [
										/* @__PURE__ */ h("input", {
											type: "checkbox",
											checked: G,
											disabled: !U,
											onChange: (e) => oe(e.target.checked)
										}),
										/* @__PURE__ */ h(Y, {
											role: "approved",
											size: 18
										}),
										/* @__PURE__ */ h("span", { children: "这个会话的工具调用不用逐个批准" })
									]
								})]
							}),
							K?.push && l && /* @__PURE__ */ h("div", {
								className: "nr-push",
								"data-testid": "new-push",
								children: /* @__PURE__ */ h(Dt, {
									path: l.path,
									branch: K.push.branch,
									remoteUrl: K.push.remote_url,
									target: K.push.branch,
									onDone: () => v.reload()
								})
							}),
							/* @__PURE__ */ g("div", {
								className: "nr-go-row",
								children: [/* @__PURE__ */ g("button", {
									type: "button",
									className: "br-btn is-primary nr-go-btn",
									disabled: !We,
									onClick: () => void ke(),
									children: [/* @__PURE__ */ h(Y, {
										role: "deploy",
										size: 20
									}), Ee.busy ? "正在开工…" : Z.start]
								}), Ue ? /* @__PURE__ */ g("span", {
									className: `nr-why${tt ? " is-ok" : ""}`,
									"data-testid": "start-why",
									children: [/* @__PURE__ */ h("i", {
										"aria-hidden": "true",
										children: tt ? "✓" : "✋"
									}), Ue]
								}) : !Ee.busy && /* @__PURE__ */ g("span", {
									className: "nr-why is-ok",
									"data-testid": "start-ready",
									children: [/* @__PURE__ */ h("i", {
										"aria-hidden": "true",
										children: "✓"
									}), "可以开工了"]
								})]
							}),
							Ee.error && /* @__PURE__ */ h("p", {
								className: "br-error",
								role: "alert",
								children: Ee.error
							}),
							De && /* @__PURE__ */ h(Ad, {
								r: De,
								big: le,
								onOpen: r,
								path: l?.path ?? "",
								onMe: (e) => t.setStatus(e.status),
								onBoard: (e) => t.go({
									kind: "board",
									repo: s,
									key: e
								}),
								onItem: (e) => t.go({
									kind: "item",
									repo: s,
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
function Ed({ n: e, title: t, state: n, sub: r }) {
	return /* @__PURE__ */ g("header", {
		className: "nr-head",
		"data-step": e,
		"data-state": n,
		children: [
			/* @__PURE__ */ h("span", {
				className: `nr-n${n ? ` is-${n}` : ""}`,
				"aria-hidden": "true",
				children: n === "done" ? "✓" : e
			}),
			/* @__PURE__ */ h("h3", { children: t }),
			r && /* @__PURE__ */ h("small", { children: r })
		]
	});
}
function Dd({ n: e, icon: t, title: n, state: r, word: i, children: a }) {
	let o = yd[r];
	return /* @__PURE__ */ g("li", {
		className: `nr-gate is-${r}`,
		"data-testid": `gate-${e}`,
		"data-state": r,
		children: [
			/* @__PURE__ */ g("div", {
				className: "nr-gate-top",
				children: [
					/* @__PURE__ */ h(Y, {
						role: t,
						size: 20
					}),
					/* @__PURE__ */ g("span", {
						className: "nr-gate-n",
						children: [
							"第 ",
							e,
							" 关"
						]
					}),
					/* @__PURE__ */ g("span", {
						className: `br-chip kt-pill tone-${o.tone}`,
						children: [/* @__PURE__ */ h("i", {
							"aria-hidden": "true",
							children: o.glyph
						}), i]
					})
				]
			}),
			/* @__PURE__ */ h("b", {
				className: "nr-gate-title",
				children: n
			}),
			a
		]
	});
}
function Od({ c: e, stale: t }) {
	let n = e.ok && e.blocking.length === 0 && !e.error, r = [...e.blocking_raw ?? [], ...e.findings], i = (e.files ?? []).filter((e) => e.review), a = i.length ? i.map((e) => [e.name, Sd(e.review)]) : e.review.map((e) => ["", Sd(e)]);
	return /* @__PURE__ */ g("div", {
		className: `nr-result${t ? " is-stale" : ""}`,
		"data-testid": "check-result",
		children: [
			e.error ? /* @__PURE__ */ h("p", {
				className: "br-error br-pre",
				role: "alert",
				children: e.error
			}) : /* @__PURE__ */ g("div", {
				className: `nr-verdict ${n ? "is-ok" : "is-bad"}`,
				role: "status",
				children: [/* @__PURE__ */ h(Y, {
					role: n ? "approved" : "blocked",
					size: 22
				}), /* @__PURE__ */ h("b", { children: n ? "检查过了：可以开工。" : "有关卡没过：照下面红色那几行改，再检查一遍。" })]
			}),
			e.blocking.length > 0 && /* @__PURE__ */ h("ul", {
				className: "nr-stops",
				"data-testid": "blocking",
				children: e.blocking.map((e, t) => /* @__PURE__ */ h("li", { children: e }, t))
			}),
			!e.error && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("div", {
				className: "nr-cells",
				children: [
					/* @__PURE__ */ h(kd, {
						n: e.blocking.length,
						label: "拦下",
						tone: e.blocking.length ? "bad" : "ok"
					}),
					/* @__PURE__ */ h(kd, {
						n: e.review.length,
						label: "请你确认",
						tone: e.review.length ? "warn" : "ok"
					}),
					/* @__PURE__ */ h(kd, {
						n: e.sources,
						label: "份收下"
					}),
					/* @__PURE__ */ h(kd, {
						n: e.refused.length,
						label: "份没收",
						tone: e.refused.length ? "warn" : void 0
					})
				]
			}), /* @__PURE__ */ g("ul", {
				className: "nr-pkg",
				"data-testid": "check-summary",
				"aria-label": "文档包",
				children: [
					/* @__PURE__ */ g("li", { children: [/* @__PURE__ */ h("small", { children: "密级" }), /* @__PURE__ */ h("b", { children: e.classification ? Le[e.classification] ?? e.classification : "—" })] }),
					/* @__PURE__ */ g("li", { children: [/* @__PURE__ */ h("b", { children: e.segments }), /* @__PURE__ */ h("small", { children: "段" })] }),
					e.key && /* @__PURE__ */ g("li", { children: [/* @__PURE__ */ h("small", { children: "需求号" }), /* @__PURE__ */ h("b", {
						className: "br-mono",
						children: e.key
					})] })
				]
			})] }),
			(e.files?.length ?? 0) > 0 && /* @__PURE__ */ h("ul", {
				className: "nr-files",
				"data-testid": "check-files",
				children: e.files?.map((e) => /* @__PURE__ */ g("li", {
					className: `nr-file${e.refused ? " is-refused" : ""}`,
					"data-file": e.id,
					children: [/* @__PURE__ */ g("b", { children: [/* @__PURE__ */ h(Y, {
						role: "file",
						size: 15
					}), e.name] }), e.refused ? /* @__PURE__ */ g("span", {
						className: "nr-file-no",
						children: [/* @__PURE__ */ h("span", {
							className: "br-chip tone-warn",
							children: "没收"
						}), e.refused]
					}) : e.items.length > 0 ? /* @__PURE__ */ h("ul", { children: e.items.map((e, t) => /* @__PURE__ */ h("li", { children: e }, t)) }) : /* @__PURE__ */ h("span", {
						className: "br-dim br-small",
						children: "没找到要处理的"
					})]
				}, e.id))
			}),
			a.length > 0 && /* @__PURE__ */ g("div", {
				className: "nr-review",
				"data-testid": "review",
				children: [
					/* @__PURE__ */ g("span", {
						className: "nr-review-head",
						children: [/* @__PURE__ */ h("i", {
							"aria-hidden": "true",
							children: "!"
						}), /* @__PURE__ */ h("b", {
							className: "br-strong",
							children: "请你确认"
						})]
					}),
					/* @__PURE__ */ h("ul", { children: a.map(([e, t], n) => /* @__PURE__ */ g("li", { children: [e && /* @__PURE__ */ g("b", { children: [e, "："] }), t] }, n)) }),
					/* @__PURE__ */ h("p", { children: "这些没打码，也不拦开工：可能是人名或密码，也可能只是普通的词。是人名或密码的话，先改原文，再检查一遍。" })
				]
			}),
			(r.length > 0 || e.package) && /* @__PURE__ */ g("details", {
				className: "br-raw nr-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节：brain-kit 的原话" }), /* @__PURE__ */ h("pre", {
					"data-testid": "findings",
					children: [...e.package ? [`文档包 ${e.package}`] : [], ...r].join("\n")
				})]
			})
		]
	});
}
function kd({ n: e, label: t, tone: n }) {
	return /* @__PURE__ */ g("div", {
		className: `nr-cell${n ? ` is-${n}` : ""}`,
		children: [/* @__PURE__ */ h("b", { children: e }), /* @__PURE__ */ h("small", { children: t })]
	});
}
function Ad({ r: e, big: t = !1, path: n, onOpen: r, onBoard: i, onItem: a, onMe: o }) {
	return /* @__PURE__ */ g("div", {
		className: `nr-started ${e.ok ? "is-ok" : "is-bad"}`,
		"data-testid": "start-result",
		children: [
			/* @__PURE__ */ g("div", {
				className: "nr-started-head",
				children: [/* @__PURE__ */ h("span", {
					className: "nr-started-mark",
					"aria-hidden": "true",
					children: e.ok ? "✓" : "✕"
				}), /* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", {
					role: "status",
					children: e.ok ? `开工了${e.key ? `：${e.key}` : ""}` : e.problem ? `没开成：${e.problem.text}` : "没开成"
				}), /* @__PURE__ */ h("small", { children: e.ok ? e.url ? _d : `分支和工作目录都好了。要开会话时，在${Z.openDetail}里点「${Z.openSession}」。` : e.problem?.todo || "原因在下面「细节」里（开工时 brain-kit 的原话）：照它改好，再点「开工」。" })] })]
			}),
			e.ok && /* @__PURE__ */ g("dl", {
				className: "nr-facts",
				children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("dt", { children: "分支" }), /* @__PURE__ */ h("dd", { children: e.branch ?? "—" })] }), /* @__PURE__ */ g("div", {
					className: "is-wide",
					children: [/* @__PURE__ */ h("dt", { children: "工作目录" }), /* @__PURE__ */ h("dd", { children: e.worktree ?? "—" })]
				})]
			}),
			e.ok && t && /* @__PURE__ */ g("p", {
				className: "nr-big-next",
				"data-testid": "start-big",
				children: [/* @__PURE__ */ h(Y, {
					role: "scope",
					size: 16
				}), /* @__PURE__ */ g("span", { children: [
					/* @__PURE__ */ h("b", { children: "大需求：" }),
					"在会话里做需求和设计，设计里拆单元（unit-of-work.md）；批完设计，在需求看板上点「",
					Q.split,
					"」。"
				] })]
			}),
			/* @__PURE__ */ g("div", {
				className: "br-row",
				children: [e.url && /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: () => r(e.url),
					children: [/* @__PURE__ */ h(Y, {
						role: "laptop",
						size: 18
					}), Z.openSession]
				}), e.key && e.ok && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn",
					onClick: () => i(e.key),
					children: [/* @__PURE__ */ h($, {
						name: "LayoutDashboard",
						size: 15
					}), Z.openBoard]
				}), /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn",
					onClick: () => a(e.key),
					children: [/* @__PURE__ */ h(Y, {
						role: "file",
						size: 16
					}), Z.openDetail]
				})] })]
			}),
			!e.ok && e.problem?.fix === "me" && e.me && n && /* @__PURE__ */ h("div", {
				className: "br-banner is-error nr-who",
				role: "alert",
				"data-testid": "start-who",
				children: /* @__PURE__ */ h(Rt, {
					path: n,
					me: e.me,
					onSaved: o
				})
			}),
			!e.url && e.session_error && /* @__PURE__ */ g("p", {
				className: "br-error br-pre",
				role: "alert",
				children: ["会话没开成：", e.session_error]
			}),
			e.output && /* @__PURE__ */ g("details", {
				className: "br-raw nr-out",
				open: !e.ok && !e.problem,
				children: [/* @__PURE__ */ h("summary", { children: "细节：开工时 brain-kit 的原话" }), /* @__PURE__ */ h("pre", { children: e.output })]
			})
		]
	});
}
var jd = "\n.nr-root { --nr-gap: 16px; container: nr / inline-size; }\n.nr-hero { gap: 16px; padding: 22px 26px; }\n.nr-hero h2 { margin-bottom: 4px; }\n.nr-form { display: grid; gap: var(--nr-gap); }\n.nr-sec { gap: 14px; }\n.nr-head { display: flex; align-items: center; gap: 6px 12px; flex-wrap: wrap; }\n.nr-head h3 { font-size: 1.15em; font-weight: 800; color: var(--text-strong); margin: 0; }\n.nr-head small { color: var(--muted); font-size: .88em; }\n.nr-bad-icon { color: var(--kt-bad); }\n.nr-wait-icon { color: var(--kt-approve); }\n.nr-n { display: inline-grid; place-items: center; width: 1.75em; height: 1.75em; border-radius: 50%; font-size: .88em; font-weight: 850;\n  background: color-mix(in srgb, var(--muted) 24%, transparent); color: var(--text-strong); }\n.nr-n.is-done { background: var(--kt-ok-solid); color: #fff; }\n.nr-n.is-now { background: var(--accent); color: var(--accent-fg, #fff); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 25%, transparent); }\n.nr-n.is-bad { background: var(--kt-bad-solid); color: #fff; }\n.nr-n.is-off { background: transparent; border: 1px dashed var(--border-strong, var(--border)); color: var(--muted); }\n.nr-sec.is-ok { border-color: var(--kit-ok); }\n.nr-crew-wait { min-height: 1.6em; }\n.nr-waiting { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }\n.nr-waiting > li { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: start; gap: 6px 10px; padding: 10px 14px; border-radius: 12px;\n  border: 1px solid var(--border); background: var(--kt-glass); }\n.nr-waiting > li > b { color: var(--text-strong); }\n.nr-waiting > li > :nth-child(n+3) { grid-column: 1 / -1; }\n.nr-waiting > li > .nr-waiting-go { justify-self: start; }\n.nr-kit-todo { margin: 0; }\n.nr-kit-todo b { color: var(--muted); font-weight: 650; margin-right: .5em; }\n\n/* the fields: a grid of six columns */\n.nr-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px 16px; align-items: start; }\n.nr-grid > * { grid-column: span 3; min-width: 0; }\n.nr-grid > .is-2 { grid-column: span 2; }\n.nr-grid > .is-4 { grid-column: span 4; }\n.nr-grid > .is-full { grid-column: 1 / -1; }\n@container nr (max-width: 820px) { .nr-grid > * { grid-column: 1 / -1 !important; } }\n.nr-grid :is(input[type=\"text\"], input:not([type]), select, textarea) { width: 100%; }\n.nr-grid > .br-field { align-content: start; }\n.nr-grid textarea { min-height: 2.9em; }\n.nr-grid input[readonly] { opacity: .8; cursor: not-allowed; }\n.nr-hl { padding: 6px 8px; margin: -6px -8px; border-radius: 10px; box-shadow: 0 0 0 2px var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 7%, transparent); }\n.nr-who { display: grid; gap: 6px; }\n.nr-nodocs { margin: 0; display: flex; align-items: center; gap: 8px; padding: 9px 14px; border-radius: 12px; border: 1px dashed var(--border-strong, var(--border));\n  color: var(--muted); font-size: .92em; }\n\n/* the five gates: a row of cards, arrows between them (the board's team introduction) */\n.nr-gates { list-style: none; margin: 0; padding: 0; display: grid; gap: 20px;\n  grid-template-columns: minmax(0, 1fr) minmax(0, 1.45fr) minmax(0, 1.1fr) minmax(0, 1.35fr) minmax(0, 1fr); align-items: stretch; }\n@container nr (max-width: 1180px) { .nr-gates { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; } .nr-gate::after { display: none; } }\n@container nr (max-width: 560px) { .nr-gates { grid-template-columns: minmax(0, 1fr); } }\n.nr-gate { position: relative; display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px 14px 14px; border-radius: 14px;\n  border: 1px solid var(--border); background: var(--bg-elevated, var(--card)); transition: border-color .2s, background .2s; }\n.nr-gate:not(:last-child)::after { content: '→'; position: absolute; right: -16px; top: 50%; transform: translateY(-50%); color: var(--kt-handoff); font-weight: 900; font-size: 1.1em; }\n.nr-gate.is-ok { border-color: var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 7%, var(--card)); }\n.nr-gate.is-wait { border-color: var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }\n.nr-gate.is-bad { border-color: var(--kt-bad); box-shadow: 0 0 0 1px var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); }\n.nr-gate.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 7%, var(--card)); }\n.nr-gate.is-auto { border-color: color-mix(in srgb, var(--kt-info) 38%, var(--border)); }\n.nr-gate-top { display: flex; align-items: center; gap: 8px; }\n.nr-gate-top .kt-role-icon { color: var(--text-strong); opacity: .9; }\n.nr-gate.is-ok .nr-gate-top .kt-role-icon { color: var(--kt-ok); opacity: 1; }\n.nr-gate.is-wait .nr-gate-top .kt-role-icon { color: var(--kt-approve); opacity: 1; }\n.nr-gate.is-bad .nr-gate-top .kt-role-icon { color: var(--kt-bad); opacity: 1; }\n.nr-gate-n { font-size: .84em; font-weight: 800; color: var(--muted); letter-spacing: .04em; white-space: nowrap; }\n.nr-gate-top .kt-pill { margin-left: auto; }\n.nr-gate.is-wait .kt-pill i { animation: kt-blink 1.6s ease-in-out infinite; }\n.nr-gate-title { font-size: 1.06em; font-weight: 800; color: var(--text-strong); }\n.nr-gate p { margin: 0; font-size: .86em; color: var(--text); line-height: 1.55; }\n.nr-gate p.nr-gate-rule { color: var(--kt-warn); font-weight: 650; }\n.nr-opts { display: flex; flex-wrap: wrap; gap: 6px; }\n.nr-opt { display: inline-flex; align-items: center; gap: 6px; padding: 4px 11px 4px 8px; border-radius: 999px; cursor: pointer; font-size: .9em; font-weight: 650;\n  border: 1px solid var(--border-strong, var(--border)); background: var(--card); color: var(--text); }\n.nr-opt input { margin: 0; accent-color: var(--accent); }\n.nr-opt:hover { border-color: var(--accent); }\n.nr-opt.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 17%, var(--card)); color: var(--text-strong); }\n.nr-opt.is-refused { border-style: dashed; }\n.nr-opt.is-refused.is-on { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 12%, var(--card)); }\n.nr-opt .nr-no { font-size: .8em; color: var(--kt-bad); font-weight: 750; }\n.nr-opt:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.nr-gate > .nr-opt { align-self: flex-start; border-radius: 12px; white-space: normal; }\n\n/* the check's answer */\n.nr-result { display: grid; gap: 12px; }\n.nr-result.is-stale { opacity: .55; }\n.nr-verdict { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 12px; font-size: 1.04em; }\n.nr-verdict.is-ok { border: 1px solid var(--kit-ok); background: color-mix(in srgb, var(--kt-ok) 9%, var(--card)); color: var(--kt-ok); }\n.nr-verdict.is-bad { border: 1px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, var(--card)); color: var(--kt-bad); }\n.nr-verdict b { font-weight: 800; }\n.nr-stops { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.nr-stops li { padding: 8px 12px; border-radius: 10px; border-left: 3px solid var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent);\n  color: var(--text-strong); font-weight: 650; }\n.nr-cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }\n@container nr (max-width: 820px) { .nr-cells { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n.nr-cell { display: flex; align-items: baseline; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); }\n.nr-cell b { font-size: 1.9em; font-weight: 800; line-height: 1.1; letter-spacing: -.02em; font-variant-numeric: tabular-nums; color: var(--text-strong); }\n.nr-cell small { color: var(--muted); font-weight: 700; font-size: .9em; }\n.nr-cell.is-ok { border-color: var(--kit-ok); } .nr-cell.is-ok b { color: var(--kt-ok); }\n.nr-cell.is-bad { border-color: var(--kt-bad); background: color-mix(in srgb, var(--kt-bad) 9%, transparent); } .nr-cell.is-bad b { color: var(--kt-bad); }\n.nr-cell.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); background: color-mix(in srgb, var(--kt-warn) 8%, transparent); } .nr-cell.is-warn b { color: var(--kt-warn); }\n.nr-pkg { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }\n.nr-pkg li { display: inline-flex; align-items: baseline; gap: 6px; padding: 4px 11px; border-radius: 10px;\n  border: 1px solid color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 9%, transparent); }\n.nr-pkg small { color: var(--muted); font-size: .84em; font-weight: 650; }\n.nr-pkg b { color: var(--text-strong); font-weight: 750; }\n.nr-files { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 17em), 1fr)); gap: 8px; }\n.nr-file { display: grid; gap: 6px; align-content: start; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border); background: var(--kt-glass); min-width: 0; }\n.nr-file > b { display: flex; align-items: center; gap: 6px; color: var(--text-strong); word-break: break-all; }\n.nr-file ul { margin: 0; padding-left: 1.2em; display: grid; gap: 2px; font-size: .88em; color: var(--text); }\n.nr-file.is-refused { border-style: dashed; border-color: color-mix(in srgb, var(--kt-warn) 60%, var(--border)); }\n.nr-file-no { display: flex; align-items: baseline; gap: 6px; font-size: .88em; color: var(--kt-warn); font-weight: 650; }\n.nr-file-no > .br-chip { flex: none; }\n.nr-review { display: grid; gap: 6px; padding: 10px 14px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--kt-warn) 60%, var(--border));\n  background: color-mix(in srgb, var(--kt-warn) 8%, var(--card)); }\n.nr-review-head { display: inline-flex; align-items: center; gap: 8px; }\n.nr-review-head i { font-style: normal; display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 7px; font-weight: 900; font-size: .85em;\n  color: var(--kt-warn); border: 2px solid var(--kt-warn); background: color-mix(in srgb, var(--kt-warn) 14%, transparent); }\n.nr-review ul { margin: 0; padding-left: 1.3em; color: var(--text-strong); }\n.nr-review li b { font-weight: 700; }\n.nr-review p { margin: 0; font-size: .86em; color: var(--muted); }\n.nr-raw pre { white-space: pre-wrap; word-break: break-word; max-height: 16em; overflow: auto; }\n\n/* 开工 */\n.nr-toggles { display: flex; flex-wrap: wrap; gap: 8px; }\n.nr-toggle { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 12px; cursor: pointer; font-weight: 650;\n  border: 1px solid var(--border); background: var(--kt-glass); color: var(--text); }\n.nr-toggle input { margin: 0; accent-color: var(--accent); }\n.nr-toggle.is-on { border-color: color-mix(in srgb, var(--accent) 60%, var(--border)); background: color-mix(in srgb, var(--accent) 10%, var(--card)); color: var(--text-strong); }\n.nr-toggle.is-disabled { opacity: .55; cursor: not-allowed; }\n.nr-toggle:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }\n.nr-push { padding: 10px 14px; border-radius: 12px; border: 1px solid var(--kit-wait); background: color-mix(in srgb, var(--kt-approve) 6%, var(--card)); }\n.nr-go-row { display: flex; align-items: center; gap: 10px 16px; flex-wrap: wrap; }\n.nr-go-btn { font-size: 1.14em; padding: 12px 34px; border-radius: 14px; font-weight: 800; }\n.nr-go-btn:not(:disabled) { box-shadow: 0 10px 30px -12px var(--accent); }\n.nr-why { display: inline-flex; align-items: center; gap: 7px; padding: 5px 13px; border-radius: 999px; font-weight: 700; min-width: 0;\n  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 11%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 42%, transparent); }\n.nr-why i { font-style: normal; }\n.nr-why.is-ok { color: var(--kt-ok); background: color-mix(in srgb, var(--kt-ok) 11%, transparent); border-color: color-mix(in srgb, var(--kt-ok) 42%, transparent); }\n.nr-started { display: grid; gap: 14px; padding: 16px 20px; border-radius: 16px; border: 1px solid var(--kit-ok);\n  background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-ok) 14%, transparent), transparent 60%), var(--card); }\n.nr-started.is-bad { border-color: var(--kit-bad); background: radial-gradient(70% 120% at 0% 0%, color-mix(in srgb, var(--kt-bad) 12%, transparent), transparent 60%), var(--card); }\n.nr-started-head { display: flex; align-items: center; gap: 14px; }\n.nr-started-head > div { display: grid; gap: 2px; }\n.nr-started-head b { font-size: 1.35em; font-weight: 850; color: var(--text-strong); }\n.nr-started-head small { color: var(--text); font-size: .95em; }\n.nr-started-mark { flex: none; width: 42px; height: 42px; border-radius: 13px; display: grid; place-items: center; font-weight: 900; font-size: 1.35em;\n  background: var(--kt-ok-solid); color: #fff; box-shadow: 0 0 24px -6px var(--kt-ok); }\n.nr-started.is-bad .nr-started-mark { background: var(--kt-bad-solid); box-shadow: none; }\n.nr-facts { display: grid; grid-template-columns: repeat(2, minmax(0, auto)); justify-content: start; gap: 8px 28px; margin: 0; }\n@container nr (max-width: 1000px) { .nr-facts { grid-template-columns: minmax(0, 1fr); } }\n.nr-facts dt { font-size: .82em; color: var(--muted); font-weight: 700; }\n.nr-facts dd { margin: 2px 0 0; font-family: var(--mono, ui-monospace, monospace); font-size: .95em; color: var(--text-strong); word-break: break-all; }\n.nr-out pre { max-height: 16em; overflow: auto; }\n\n/* 大需求：先拆成小需求 */\n.nr-big { display: grid; gap: 6px; }\n.nr-big .nr-toggle { justify-self: start; }\n.nr-big .br-hint { margin: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }\n.nr-big-why { display: inline-flex; align-items: center; gap: 6px; padding: 2px 11px; border-radius: 999px; font-weight: 700;\n  color: var(--kt-approve); background: color-mix(in srgb, var(--kt-approve) 11%, transparent); border: 1px solid color-mix(in srgb, var(--kt-approve) 42%, transparent); }\n.nr-big-why i { font-style: normal; }\n.nr-big-next { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 9px 12px; border-radius: 10px; color: var(--text);\n  border: 1px dashed color-mix(in srgb, var(--kt-info) 50%, var(--border)); background: color-mix(in srgb, var(--kt-info) 6%, transparent); }\n.nr-big-next .kt-role-icon { flex: none; margin-top: 2px; color: var(--kt-info); }\n.nr-big-next b { color: var(--text-strong); }\n", Md = [
	[
		"需求",
		"需求",
		"逆向工程 · 需求分析 · 用户故事"
	],
	[
		"设计",
		"设计",
		"应用设计 · 拆分单元 · 功能设计"
	],
	[
		"构建",
		"构建",
		"代码生成 · 构建测试"
	],
	[
		"交给运行机",
		"交给运行机",
		"交接 · 运行机接手"
	],
	[
		"发布验收",
		"发布 · 验收",
		"发布审批 · 产品验收"
	],
	[
		"已合并",
		"已合并",
		"近 14 天"
	]
], Nd = [
	[
		"you",
		"轮到你",
		"person",
		!0
	],
	[
		"people",
		"等别人",
		"wait",
		!0
	],
	[
		"agent",
		"AI 在本机做",
		"laptop",
		!1
	],
	[
		"runner",
		"运行机在跑",
		"runner",
		!1
	],
	[
		"unclaimed",
		"待认领",
		"list",
		!1
	]
], Pd = Object.fromEntries(Nd.map(([e, t]) => [e, t])), Fd = Object.fromEntries(Md.map(([e, t]) => [e, t])), Id = {
	you: "you",
	product: "people",
	people: "people",
	builder: "people",
	agent: "agent",
	runner: "runner",
	bridge: "runner",
	nobody: null
}, Ld = /* @__PURE__ */ new Set([
	"handed_over",
	"running",
	"rejected",
	"parked"
]);
function Rd(e) {
	if (e.state === "closed" || e.state === "merged_into_parent") return null;
	if (e.state === "merged") return "已合并";
	if (e.state === "acceptance") return "发布验收";
	if (e.state === "unclaimed") return "构建";
	let t = e.lean.stage_n ?? 0, n = e.state === "handed_over" || e.state === "running" || e.state === "rejected" || e.state === "parked" && (e.mr !== null || e.run_ids.length > 0), r = e.family?.role;
	return r === "child" && !n ? "构建" : n && !e.local_only ? "交给运行机" : t >= 11 ? "发布验收" : r === "parent" ? e.family?.family_state === "ready_to_release" ? "发布验收" : "构建" : e.state === "claimed" || t <= 3 ? "需求" : t <= 8 ? "设计" : "构建";
}
var zd = (e) => e.home ?? e.repo;
function Bd(e) {
	return e.state === "unclaimed" ? "unclaimed" : Id[e.waits.who] ?? (Ld.has(e.state) ? "runner" : "agent");
}
function Vd(e) {
	let t = e.waits.do;
	return e.waits.who !== "you" || !t || t === "none" || t === "watch" ? null : e.waits.review ? {
		label: Z.review,
		review: {
			repo: e.repo,
			key: e.key,
			slot: Ud(e.session_url),
			worktree: e.worktree
		}
	} : (t === "reply" || t === "tool") && e.session_url ? {
		label: X[t],
		session: e.session_url
	} : t === "start" && e.family?.role === "child" ? {
		label: X.start,
		view: {
			kind: "board",
			repo: e.repo,
			key: e.key,
			from: "overview"
		}
	} : t === "start" ? {
		label: X.start,
		view: {
			kind: "new",
			repo: e.repo,
			key: e.key,
			title: e.title
		}
	} : t === "answer" && e.waits.where === "mr" && e.mr?.url ? {
		label: Z.answerOnMr,
		href: e.mr.url
	} : t === "write_back" ? {
		label: X.write_back,
		view: {
			kind: "brain",
			repo: e.repo,
			reflect: e.key
		}
	} : {
		label: X[t],
		view: {
			kind: "board",
			repo: e.repo,
			key: e.key,
			from: "overview",
			...t === "accept" ? { focus: "accept" } : {}
		}
	};
}
function Hd(e, t) {
	let n = e.waits.since;
	return typeof n == "number" && Number.isFinite(n) ? `已等 ${he(t - n)}` : "";
}
var Ud = (e) => e ? new URLSearchParams(e.split("?")[1] ?? "").get("sid") : null;
function Wd({ step: e, onGo: t, primary: n = !0 }) {
	let r = f(), i = `kt-btn is-small${n ? " is-primary" : ""} br-step`, a = (e) => e.stopPropagation();
	if (e.review) {
		let t = e.review;
		return /* @__PURE__ */ h("span", {
			className: "br-step br-review",
			onClick: a,
			onKeyDown: a,
			children: /* @__PURE__ */ h(Vr, {
				repo: t.repo,
				reqKey: t.key,
				liveSlot: t.slot,
				worktree: t.worktree
			})
		});
	}
	return e.href ? /* @__PURE__ */ h("a", {
		className: i,
		href: e.href,
		target: "_blank",
		rel: "noopener noreferrer",
		onClick: a,
		"aria-label": `${e.label} ↗`,
		children: /* @__PURE__ */ h(Gd, { text: e.label })
	}) : /* @__PURE__ */ h("button", {
		type: "button",
		className: i,
		"aria-label": `${e.label} ↗`,
		onClick: (n) => {
			a(n), e.session ? r(e.session) : e.view && t(e.view);
		},
		children: /* @__PURE__ */ h(Gd, { text: e.label })
	});
}
function Gd({ text: e }) {
	let t = He[e] ?? 0;
	return /* @__PURE__ */ g(m, { children: [t > 0 && /* @__PURE__ */ h("span", {
		className: "br-nw",
		children: e.slice(0, t)
	}), /* @__PURE__ */ g("span", {
		className: "br-nw",
		children: [e.slice(t), " ↗"]
	})] });
}
var Kd = (e) => e.some((e) => e.family?.role === "parent" || e.family?.role === "child" || e.state === "unclaimed"), qd = {
	unclaimed: {
		glyph: "◌",
		tone: "idle",
		seg: ""
	},
	claimed: {
		glyph: "○",
		tone: "info",
		seg: "is-claimed"
	},
	in_progress: {
		glyph: "●",
		tone: "run",
		seg: "is-run"
	},
	merged: {
		glyph: "✔",
		tone: "ok",
		seg: "is-pass"
	},
	closed: {
		glyph: "■",
		tone: "idle",
		seg: ""
	}
};
function Jd(e) {
	if (e.progress) return {
		merged: e.progress.merged,
		total: e.progress.total
	};
	let t = e.children.filter((e) => e.state !== "closed");
	return {
		merged: t.filter((e) => e.state === "merged").length,
		total: t.length
	};
}
function Yd(e) {
	return e.blocked_by.map((t) => e.depends_on.find((e) => e.key === t) ?? {
		key: t,
		unit: null,
		state: null,
		owner: null,
		merged: !1,
		text: t
	});
}
function Xd(e) {
	let t = e.text || e.key;
	return `等 ${t}${/[）)]$/.test(t) ? "" : " "}合进大需求`;
}
function Zd({ f: e }) {
	let { merged: t, total: n } = Jd(e), r = e.children.filter((e) => e.state !== "closed"), i = r.length ? r.map((e) => ({
		key: e.key,
		cls: qd[e.state]?.seg ?? "",
		title: `${e.key}${e.unit ? ` ${e.unit}` : ""}：${e.state_label}`
	})) : Array.from({ length: n }, (e, n) => ({
		key: String(n),
		cls: n < t ? "is-pass" : "",
		title: ""
	}));
	return /* @__PURE__ */ g("div", {
		className: "br-fam-bar",
		children: [/* @__PURE__ */ h("div", {
			className: "kt-segs br-segs",
			role: "img",
			"aria-label": `小需求合并了 ${t}/${n}`,
			children: i.map((e) => /* @__PURE__ */ h("i", {
				className: e.cls,
				title: e.title || void 0
			}, e.key))
		}), /* @__PURE__ */ g("b", { children: [
			t,
			"/",
			n
		] })]
	});
}
function Qd({ f: e }) {
	let t = e.children.filter((e) => e.state !== "closed");
	return /* @__PURE__ */ h("div", {
		className: "br-fkids",
		"data-testid": "flow-kids",
		children: t.map((e) => {
			let t = qd[e.state] ?? qd.claimed;
			return /* @__PURE__ */ g("span", {
				className: `br-fkid tone-${t.tone}`,
				"data-kid": e.key,
				"data-state": e.state,
				title: `${e.key}${e.title ? ` ${e.title}` : ""}：${e.state_label}`,
				children: [
					/* @__PURE__ */ h("i", {
						"aria-hidden": "true",
						children: t.glyph
					}),
					/* @__PURE__ */ h("span", {
						className: "kt-mono",
						children: e.key
					}),
					e.unit && /* @__PURE__ */ h("span", {
						className: "br-fkid-unit",
						children: e.unit
					})
				]
			}, e.key);
		})
	});
}
function $d({ r: e, at: t, hl: n, repoName: r, h: i }) {
	let a = Bd(e), o = e.family, s = a === "you" || a === "people", c = a === "agent" || a === "runner", l = a === "unclaimed", u = o?.role === "child" ? o : null, d = o?.role === "parent" ? o : null, f = u ? Yd(u) : [], p = Vd(e), m = (s ? Hd(e, t) : "") || (e.updated_at === null ? "" : se(e.updated_at, t)), _ = l ? "还没人认领" : a === "people" && e.waits.who === "people" ? e.owner ? `等 ${e.owner}` : je("people") : [e.owner, a === "people" ? je(e.waits.who) : ""].filter(Boolean).join(" · "), v = e.waits.text || o?.state_label || e.state_label;
	return f.some((e) => v.includes(e.key)) && (v = u?.state_label || e.state_label), /* @__PURE__ */ g("div", {
		className: `cto-kcard cto-pick${s ? " is-live is-wait" : c ? " is-live is-agent" : ""}${l ? " br-kfree" : ""}${n === e.key ? " is-hl" : ""}`,
		"data-key": e.key,
		"data-testid": "flow-card",
		"data-role": o?.role ?? void 0,
		role: "button",
		tabIndex: 0,
		title: "打开它的需求看板",
		onClick: () => i.onOpen(e),
		onKeyDown: (t) => t.target === t.currentTarget && (t.key === "Enter" || t.key === " ") && (t.preventDefault(), i.onOpen(e)),
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-ktop",
				children: [/* @__PURE__ */ g("span", {
					className: s ? "cto-gate" : "",
					children: [s && /* @__PURE__ */ h(Y, {
						role: a === "you" ? "person" : "wait",
						size: 13
					}), /* @__PURE__ */ h("b", {
						className: "kt-mono",
						children: e.key
					})]
				}), m && /* @__PURE__ */ h("span", { children: m })]
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-ktitle",
				title: e.title,
				children: e.title
			}),
			u && /* @__PURE__ */ g("div", {
				className: "br-kfam",
				"data-testid": "flow-parent",
				children: [
					u.parent,
					" 的小需求",
					u.unit ? ` · ${u.unit}` : ""
				]
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-kfocus br-kwait",
				title: e.waits.text,
				children: v
			}),
			u && u.depends_on.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-kdeps",
				"data-testid": "flow-deps",
				children: ["依赖", u.depends_on.map((e) => /* @__PURE__ */ g("span", {
					className: e.merged ? "is-merged" : void 0,
					title: e.text,
					children: [e.merged ? "✔" : "", e.key]
				}, e.key))]
			}),
			f.map((e) => /* @__PURE__ */ h("div", {
				className: "br-kblock",
				"data-testid": "flow-blocked",
				children: Xd(e)
			}, e.key)),
			d && /* @__PURE__ */ g("div", {
				className: "br-fam",
				"data-testid": "flow-family",
				title: d.family_label || void 0,
				children: [/* @__PURE__ */ h(Zd, { f: d }), /* @__PURE__ */ h(Qd, { f: d })]
			}),
			/* @__PURE__ */ h("div", {
				className: "cto-kmeta",
				children: [
					r,
					_,
					e.credits === null ? "" : `${ce(e.credits)} credits`
				].filter(Boolean).join(" · ")
			}),
			p && /* @__PURE__ */ h(Wd, {
				step: p,
				onGo: i.onGo
			})
		]
	});
}
var ef = 3;
function tf({ rows: e, at: t, hl: n, onNew: r, repoName: i, localOnly: a = !1, repos: o = 1, ...s }) {
	let c = e.filter((e) => Rd(e) && Rd(e) !== "已合并"), l = e.filter((e) => Rd(e) === "已合并" && ((e.updated_at ?? 0) >= t - 1209600 || e.waits.who === "you")).sort((e, t) => Number(t.waits.who === "you") - Number(e.waits.who === "you")), u = (e, t) => c.filter((n) => Rd(n) === e && Bd(n) === t).sort((e, t) => (e.waits.since ?? Infinity) - (t.waits.since ?? Infinity) || (t.updated_at ?? 0) - (e.updated_at ?? 0)), d = (e) => e === "已合并" ? l.length : c.filter((t) => Rd(t) === e).length, f = (e) => c.filter((t) => Bd(t) === e), p = f("you"), _ = l.filter((e) => Bd(e) === "you"), v = Object.entries(p.reduce((e, t) => {
		let n = Ve(t.waits);
		return n ? {
			...e,
			[n]: (e[n] ?? 0) + 1
		} : e;
	}, {})), y = p.map((e) => e.waits.since).filter((e) => typeof e == "number").sort((e, t) => e - t)[0], b = Kd(e), x = new Set(e.map(zd)).size > 1, S = Nd.filter(([e]) => !(a && e === "runner") && (e !== "unclaimed" || b)), C = Md.filter(([e]) => e !== "已合并"), w = `136px ${C.map(([e]) => a && e === "交给运行机" ? "96px" : "minmax(0, 1fr)").join(" ")} minmax(0, 1fr)`;
	return /* @__PURE__ */ g("section", {
		className: "cto-card cto-flow",
		"aria-label": "需求流动",
		"data-anchor": "flow",
		"data-testid": "flow",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-flow-head",
				children: [
					/* @__PURE__ */ h("span", {
						className: "cto-live",
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ h("h3", { children: "需求流动" }),
					/* @__PURE__ */ h("span", {
						className: "cto-dim",
						children: "此刻 · 每 5 秒刷新 · 点卡片打开它的需求看板，点列名、行名看下方交付清单里的这些"
					}),
					/* @__PURE__ */ h("span", { className: "cto-grow" }),
					r && /* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn is-small cto-noprint",
						onClick: r,
						children: "开需求 ↗"
					})
				]
			}),
			/* @__PURE__ */ g("div", {
				className: "cto-stats",
				"data-testid": "flow-stats",
				children: [
					/* @__PURE__ */ g("b", { children: [
						"进行中 ",
						c.length - f("unclaimed").length,
						" 个"
					] }),
					/* @__PURE__ */ h("span", { children: "·" }),
					/* @__PURE__ */ g("b", { children: ["轮到你 ", p.length] }),
					v.length > 0 && /* @__PURE__ */ g("small", { children: [
						"（",
						v.map(([e, t]) => `${e} ${t}`).join(" · "),
						"）"
					] }),
					/* @__PURE__ */ h("span", { children: "·" }),
					/* @__PURE__ */ g("b", { children: ["等别人 ", f("people").length] }),
					/* @__PURE__ */ h("span", { children: "·" }),
					/* @__PURE__ */ g("b", { children: ["AI 在本机做 ", f("agent").length] }),
					!a && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("span", { children: "·" }), /* @__PURE__ */ g("b", { children: ["运行机在跑 ", f("runner").length] })] }),
					b && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("span", { children: "·" }), /* @__PURE__ */ g("b", { children: ["待认领 ", f("unclaimed").length] })] }),
					_.length > 0 && /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("span", { children: "·" }), /* @__PURE__ */ g("b", { children: [
						"已合并、等你",
						X.write_back,
						" ",
						_.length
					] })] })
				]
			}),
			y !== void 0 && /* @__PURE__ */ g("div", {
				className: "cto-dim",
				"data-testid": "flow-longest",
				children: [
					"轮到你的事，最久的已等 ",
					he(t - y),
					"。"
				]
			}),
			/* @__PURE__ */ g("div", {
				className: "cto-kanban br-kanban",
				role: "table",
				"aria-label": "需求流动看板",
				style: { gridTemplateColumns: w },
				children: [
					/* @__PURE__ */ h("div", {}),
					Md.map(([e, t, n]) => /* @__PURE__ */ h("div", {
						className: `cto-kb-h${a && e === "交给运行机" ? " is-off" : ""}`,
						children: /* @__PURE__ */ g("button", {
							type: "button",
							onClick: () => s.onCell(e),
							title: `在下方交付清单里看「${t}」这一列`,
							children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("b", { children: t }), !(a && e === "交给运行机") && /* @__PURE__ */ h("span", {
								className: "cto-n",
								children: d(e)
							})] }), /* @__PURE__ */ h("div", {
								className: "cto-st",
								children: a && e === "交给运行机" ? "这次不需要" : n.split(" · ").map((e, t) => /* @__PURE__ */ g("span", { children: [t > 0 && " · ", /* @__PURE__ */ h("span", {
									className: "br-nw",
									children: e
								})] }, e))
							})]
						})
					}, e)),
					S.map(([e, r, o, c], d) => /* @__PURE__ */ h(nf, {
						lane: e,
						name: r,
						icon: o,
						wait: c,
						first: d === 0,
						span: S.length,
						cols: C.map(([e]) => e),
						cell: u,
						at: t,
						hl: n,
						repoName: x ? i : () => void 0,
						merged: d === 0 ? l : null,
						localOnly: a,
						h: s
					}, e)),
					a && /* @__PURE__ */ g("div", {
						className: "br-kband",
						"data-testid": "flow-runner-off",
						children: [/* @__PURE__ */ g("span", {
							className: "br-lane-name",
							children: [/* @__PURE__ */ h(Y, {
								role: "runner",
								size: 15
							}), "运行机在跑"]
						}), /* @__PURE__ */ g("span", { children: [
							"这次不需要：",
							o > 1 ? `这 ${o} 个仓库都只在本机做` : "这个仓库只在本机做",
							"，不交给运行机"
						] })]
					})
				]
			})
		]
	});
}
function nf({ lane: e, name: t, icon: n, wait: r, first: i, span: a, cols: o, cell: s, at: c, hl: l, repoName: u, merged: d, localOnly: f, h: p }) {
	return /* @__PURE__ */ g(m, { children: [
		/* @__PURE__ */ h("div", {
			className: `cto-lane${r ? " is-wait" : ""}${e === "you" ? " is-you" : ""}${e === "unclaimed" ? " br-lane-free" : ""}`,
			children: /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-lane-name",
				onClick: () => p.onCell(void 0, e),
				title: `在下方交付清单里看「${t}」的需求`,
				children: [/* @__PURE__ */ h(Y, {
					role: n,
					size: 15
				}), t]
			})
		}),
		o.map((t) => {
			if (f && t === "交给运行机") return i ? /* @__PURE__ */ h("div", {
				className: "cto-cell br-kcell-off",
				style: { gridRow: `span ${a}` },
				"data-col": t,
				children: "这次不需要"
			}, t) : null;
			let n = s(t, e);
			return /* @__PURE__ */ g("div", {
				className: `cto-cell${r ? " is-wait" : ""}`,
				"data-col": t,
				"data-lane": e,
				children: [
					n.length === 0 && e === "you" && /* @__PURE__ */ h("div", {
						className: "cto-kempty",
						children: "此刻没有"
					}),
					n.length === 0 && t === "交给运行机" && e === "agent" && /* @__PURE__ */ h("div", {
						className: "cto-kempty",
						children: "交给运行机以后就不在本机做了"
					}),
					n.length === 0 && t === "构建" && e === "unclaimed" && /* @__PURE__ */ h("div", {
						className: "cto-kempty",
						children: "小需求都有人认领了"
					}),
					n.slice(0, ef).map((e) => /* @__PURE__ */ h($d, {
						r: e,
						at: c,
						hl: l,
						repoName: u(zd(e)),
						h: p
					}, `${e.repo}/${e.key}`)),
					n.length > ef && /* @__PURE__ */ g("button", {
						type: "button",
						className: "cto-kmore cto-link",
						onClick: () => p.onCell(t, e),
						children: [
							"+",
							n.length - ef,
							" 个（见下方交付清单）"
						]
					})
				]
			}, t);
		}),
		d && /* @__PURE__ */ g("div", {
			className: "cto-cell is-span br-merged-cell",
			"data-col": "已合并",
			style: { gridRow: `span ${a}` },
			children: [
				d.length === 0 && /* @__PURE__ */ h("div", {
					className: "cto-kempty",
					children: "近 14 天还没有合并的"
				}),
				d.slice(0, 5).map((e) => {
					let t = e.family?.role === "parent" ? Jd(e.family) : null;
					return Bd(e) === "you" ? /* @__PURE__ */ h($d, {
						r: e,
						at: c,
						hl: l,
						repoName: u(zd(e)),
						h: p
					}, `${e.repo}/${e.key}`) : /* @__PURE__ */ g("button", {
						type: "button",
						"data-key": e.key,
						className: `cto-kcard is-real${l === e.key ? " is-hl" : ""}`,
						title: "打开它的需求看板（可以回放）",
						onClick: () => p.onOpen(e),
						children: [
							/* @__PURE__ */ g("span", {
								className: "cto-ktop",
								children: [/* @__PURE__ */ h("b", {
									className: "kt-mono",
									children: e.key
								}), /* @__PURE__ */ h("span", { children: se(e.updated_at, c) })]
							}),
							/* @__PURE__ */ h("span", {
								className: "cto-ktitle",
								children: e.title
							}),
							/* @__PURE__ */ h("span", {
								className: "cto-kmeta",
								children: [
									e.owner,
									t ? `小需求 ${t.merged}/${t.total}` : "",
									e.credits === null ? "" : `${ce(e.credits)} credits`
								].filter(Boolean).join(" · ")
							})
						]
					}, `${e.repo}/${e.key}`);
				}),
				d.length > 5 && /* @__PURE__ */ g("button", {
					type: "button",
					className: "cto-kmore cto-link",
					onClick: () => p.onCell("已合并"),
					children: [
						"+",
						d.length - 5,
						" 个（见下方交付清单）"
					]
				})
			]
		})
	] });
}
//#endregion
//#region src/views/Overview.tsx
var rf = Object.keys(v), af = [
	[
		We.person,
		["<化名> <凭证号>", "owner"],
		"（桥送来的回答写化名和凭证号；本机做时负责人自己定的写 owner）"
	],
	[
		We.check,
		["check"],
		""
	],
	[
		We.brain,
		["brain <条目号>"],
		""
	],
	[
		We.agent,
		["agent"],
		""
	]
];
function of() {
	return /* @__PURE__ */ g("span", {
		"data-testid": "who-syntax",
		children: [
			"决定表（decisions.md）里「谁定的」那一格（",
			/* @__PURE__ */ h("code", { children: "Who" }),
			" 列）这样写：",
			af.map(([e, t, n], r) => /* @__PURE__ */ g("span", { children: [
				r > 0 && "；",
				"「",
				e,
				"」写 ",
				t.map((e, t) => /* @__PURE__ */ g("span", { children: [t > 0 && " 或 ", /* @__PURE__ */ h("code", { children: e })] }, e)),
				n
			] }, e))
		]
	});
}
var sf = "\n.br-ov { container: brov / inline-size; --ov-person: #008300; --ov-ink: color-mix(in srgb, var(--text) 62%, var(--card)); --ov-ink-2: color-mix(in srgb, var(--text) 46%, var(--card));\n  --ov-ink-3: color-mix(in srgb, var(--text) 32%, var(--card)); --ov-ink-4: color-mix(in srgb, var(--text) 18%, var(--card)); --ov-warn: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.br-ov .cto-hero h2 { font-size: 30px; }\n.br-ov .cto-hero p b { color: var(--text-strong); }\n.br-ov .cto-hero p .br-link { margin-left: 6px; }\n.br-ov .cto-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); }\n.br-ov .cto-value .cto-of { font-size: .5em; margin-left: 6px; }\n.br-ov .cto-value.is-word { font-size: 1.9em; color: var(--muted); }\n.br-ov .cto-link-value { font-size: 2.85em; font-weight: 800; letter-spacing: -.03em; line-height: 1.1; margin: 6px 0 2px; }\n.br-ov .cto-foot .br-link { font-size: 13px; }\n.br-ov .cto-card.is-warn { border-color: var(--ov-warn); }\n.br-ov .cto-lines button span.is-you { color: var(--kt-approve); font-weight: 650; }\n.br-ov .br-refresh { display: inline-flex; align-items: center; gap: 6px 10px; flex-wrap: wrap; justify-content: flex-end; }\n\n.br-ov .br-yours { display: grid; gap: 8px; }\n.br-ov .br-yours ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }\n.br-ov .br-yours li { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; padding: 7px 10px; border-radius: 10px; background: color-mix(in srgb, var(--kt-approve) 6%, var(--cto-cell)); }\n.br-ov .br-yours .br-yt-title { color: var(--text-strong); font-weight: 600; }\n.br-ov .br-waited { color: var(--kt-approve); font-size: 12.5px; font-weight: 650; white-space: nowrap; }\n.br-ov .br-linecopy { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }\n.br-ov .br-linecopy code { white-space: nowrap; }\n.br-ov .br-linecopy code { padding: 1px 8px; border-radius: 6px; border: 1px dashed color-mix(in srgb, var(--kt-approve) 60%, var(--border)); color: var(--text-strong); font-weight: 700; user-select: all; }\n\n.br-ov .cto-lane { justify-content: flex-start; padding: 8px 10px; }\n.br-ov .cto-lane .br-lane-name { white-space: nowrap; font-weight: 650; }\n.br-ov .cto-lane.is-you { background: color-mix(in srgb, var(--kt-approve) 28%, var(--cto-cell)); }\n.br-ov .cto-lane:not(.is-wait) .kt-role-icon { color: var(--kt-run); }\n.br-ov .br-kwait { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; font-size: 12px; }\n.br-ov .cto-kcard.is-live.is-wait .br-kwait { color: var(--kt-approve); font-weight: 650; }\n.br-ov .cto-kcard .cto-gate { display: inline-flex; align-items: center; gap: 4px; }\n.br-ov .cto-kcard .br-step { justify-self: start; margin-top: 4px; max-width: 100%; white-space: normal; text-align: left; }\n.br-ov .br-review { display: inline-grid; gap: 4px; justify-items: start; }\n.br-ov .br-review .kt-btn { padding: 3px 10px; font-size: 13px; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }\n.br-ov .br-review .br-note, .br-ov .br-review .br-error { margin: 0; font-size: 12px; }\n.br-ov .cto-kcard .cto-ktop { flex-wrap: wrap; }\n.br-ov .cto-kmore.cto-link { text-align: left; padding: 0 4px; font-size: 12px; color: var(--accent); }\n.br-ov .cto-stats small { font-size: 14px; font-weight: 500; color: var(--text); margin-left: 4px; }\n.br-ov .cto-stats b { font-weight: inherit; white-space: nowrap; }\n.br-ov .cto-kb-h.is-off .cto-st { color: var(--muted); }\n.br-ov .br-kcell-off { display: grid; place-items: center; writing-mode: vertical-rl; letter-spacing: .2em; color: var(--muted); font-size: 12px; background: transparent; border: 1px dashed var(--border); }\n.br-ov .br-kband { grid-column: 1 / -1; display: flex; align-items: center; gap: 6px 14px; flex-wrap: wrap; padding: 6px 10px; border-radius: 10px; border: 1px dashed var(--border); color: var(--muted); font-size: 13px; }\n.br-ov .br-kband .br-lane-name { display: inline-flex; align-items: center; gap: 6px; font-weight: 650; color: var(--text); }\n\n.br-ov .br-ledger td .br-hint { margin-top: 2px; }\n.br-ov .br-ledger .br-col-req { min-width: 190px; }\n.br-ov .br-ledger .br-col-wait { min-width: 180px; }\n.br-ov .br-ledger .br-col-wait .br-step { margin-top: 4px; }\n.br-ov .br-ledger .br-col-nowrap { white-space: nowrap; }\n.br-ov .br-ledger .br-linecopy { margin-top: 4px; }\n.br-ov .br-lean { display: grid; gap: 3px; min-width: 116px; font-size: 12.5px; color: var(--text); }\n.br-ov .br-nw { white-space: nowrap; }\n.br-ov .br-prog > i.is-next { background: transparent; outline: 1.5px solid var(--kt-run); outline-offset: -1.5px; }\n.br-ov .br-sum code { font-size: .95em; padding: 0 4px; border-radius: 4px; background: var(--kt-glass); }\n.br-ov .br-empty-row td { color: var(--muted); padding: 18px 10px; }\n.br-ov .br-how { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; }\n.br-ov .br-how i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }\n.br-ov .br-acts { display: flex; gap: 6px; align-items: center; white-space: nowrap; }\n.br-ov .br-overlap { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }\n.br-ov .br-funnel-rows { display: flex; flex-wrap: wrap; gap: 4px 12px; margin-top: 8px; font-size: 13px; }\n.br-ov .br-funnel-rows span { display: inline-flex; align-items: center; gap: 6px; }\n.br-ov .br-funnel-rows b { color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.br-ov .br-funnel-vs { margin-top: 8px; font-size: 12.5px; line-height: 1.5; }\n.br-ov .cto-notes li { line-height: 1.6; }\n.br-ov .cto-notes code { font-size: .92em; padding: 0 4px; border-radius: 4px; background: var(--kt-glass); }\n.br-ov .cto-table tr.cto-row-pick.is-merged td { color: var(--text); }\n\n.br-ov .br-metrics { display: grid; grid-template-columns: repeat(auto-fill, minmax(176px, 1fr)); gap: 8px; margin-top: 10px; }\n.br-ov .br-metric { padding: 8px 12px; border-radius: 10px; background: var(--cto-cell); display: grid; gap: 2px; align-content: start; }\n.br-ov .br-metric > span { color: var(--text); font-size: 13px; }\n.br-ov .br-metric b { font-size: 18px; color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.br-ov .br-metric b.is-none { font-size: 14px; color: var(--muted); font-weight: 600; }\n.br-ov .br-metric small { color: var(--muted); font-size: 12px; line-height: 1.4; }\n.br-ov .br-eval-list { list-style: none; margin: 10px 0 0; padding: 0; display: grid; gap: 6px; }\n.br-ov .br-eval-list li { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }\n\n/* 大需求 and 小需求: nobody's yet is dashed (as the board's idle chips); its big one, dependencies and what blocks it */\n.br-ov .cto-kcard.br-kfree { border-style: dashed; border-color: var(--border-strong); }\n.br-ov .cto-lane.br-lane-free .kt-role-icon { color: var(--muted); }\n.br-ov .br-kfam { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }\n.br-ov .br-kdeps { display: flex; flex-wrap: wrap; gap: 0 6px; font-size: 12px; color: var(--muted); }\n.br-ov .br-kdeps span { font-family: var(--mono, ui-monospace, monospace); color: var(--text); }\n.br-ov .br-kdeps span.is-merged { color: var(--kt-ok); }\n.br-ov .br-kblock { font-size: 12px; line-height: 1.4; color: var(--kt-warn); font-weight: 650; }\n.br-ov .br-fam { display: grid; gap: 4px; margin: 3px 0 1px; }\n.br-ov .br-fam-bar { display: flex; align-items: center; gap: 8px; }\n.br-ov .br-fam-bar .kt-segs { flex: 1; margin: 0; }\n.br-ov .br-fam-bar .kt-segs i { height: 7px; }\n.br-ov .br-fam-bar b { font-size: 12px; color: var(--text-strong); font-variant-numeric: tabular-nums; }\n.br-ov .br-segs i.is-claimed { background: color-mix(in srgb, var(--kt-info) 45%, transparent); }\n.br-ov .br-fkids { display: flex; flex-wrap: wrap; gap: 1px 9px; font-size: 12px; color: var(--text); }\n.br-ov .br-fkid { display: inline-flex; align-items: baseline; gap: 3px; white-space: nowrap; }\n.br-ov .br-fkid i { font-style: normal; font-size: 11px; color: var(--br-tone); }\n.br-ov .br-fkid-unit { color: var(--muted); }\n.br-ov .br-ledger tr.br-kid td { background: color-mix(in srgb, var(--text) 2.5%, transparent); }\n.br-ov .br-ledger tr.br-kid.cto-row-pick:hover td { background: var(--cto-glass); }\n.br-ov .br-ledger tr.br-kid td:first-child { padding-left: 14px; }\n.br-ov .br-tree { color: var(--muted); font-family: var(--mono, ui-monospace, monospace); width: 1.1em; flex: none; }\n.br-ov .br-fam-toggle { font-variant-numeric: tabular-nums; cursor: pointer; }\n.br-ov .br-fam-toggle[aria-expanded=\"false\"] { border-style: dashed; }\n.br-ov .br-how-cell { display: grid; gap: 1px; justify-items: start; }\n.br-ov .br-how .br-chip { padding: 0 7px; font-size: 11.5px; }\n.br-ov .br-eval-list .br-tag b { margin-left: 4px; color: var(--text-strong); font-variant-numeric: tabular-nums; }\n\n@container brov (max-width: 1180px) {\n  .br-ov .cto-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }\n  .br-ov .br-ledger { font-size: 13px; }\n  .br-ov .br-ledger th, .br-ov .br-ledger td { padding: 8px 6px; }\n  .br-ov .br-ledger .br-acts { flex-direction: column; align-items: stretch; }\n}\n@container brov (max-width: 900px) {\n  .br-ov .br-kanban { grid-template-columns: minmax(0, 1fr) !important; }\n  .br-ov .br-merged-cell, .br-ov .br-kcell-off { grid-row: auto !important; }\n  .br-ov .br-kcell-off { writing-mode: horizontal-tb; padding: 6px; }\n}\n@container brov (max-width: 640px) { .br-ov .cto-cards { grid-template-columns: minmax(0, 1fr); } }\n", cf = (e) => e.state !== "merged" && e.state !== "merged_into_parent" && e.state !== "closed", lf = {
	id: "elsewhere",
	label: "没导入的项目",
	keep: (e) => zd(e) === "runner"
}, uf = (e) => `${e.repo}/${e.key}`;
function df(e, t) {
	let n = Object.fromEntries(t.map((e) => [e, {
		open: 0,
		you: 0
	}]));
	for (let r of e) for (let e of t.includes("all") ? [zd(r), "all"] : [zd(r)]) {
		let t = n[e] ??= {
			open: 0,
			you: 0
		};
		cf(r) && (t.open += 1), r.waits.who === "you" && r.state !== "closed" && (t.you += 1);
	}
	return n;
}
function ff({ entry: t, status: n, go: r, replace: a, reloadStatus: l, pollMs: d }) {
	let [f, p] = c(t.repo ?? "all"), [_, v] = c(t.state), [y, b] = c(null), [x, S] = c(14), [C, w] = c({}), T = s(null), D = n?.repos ?? [], O = !!n && D.length === 0, k = n?.brainkit.ok === !1, A = N(O ? null : E.overview(f), d ?? 5e3), j = A.data, M = o(() => new Map((j?.cto.runs ?? []).map((e) => [uf(e), e])), [j]), P = o(() => j ? gf(j.rows.filter((e) => (!_ || e.state === _) && (!y || y.keep(e, M.get(uf(e)))))) : [], [
		j,
		_,
		y,
		M
	]), [ee, F] = c(() => /* @__PURE__ */ new Set()), te = o(() => _f(P), [P]), I = (e) => F((t) => {
		let n = new Set(t);
		return n.delete(e) || n.add(e), n;
	}), L = (e) => 1 + (ee.has(uf(e.r)) ? 0 : e.kids.length), R = te.reduce((e, t) => e + L(t), 0), z = [];
	for (let e = 0, t = 0; t < te.length && e < x; t++) z.push(te[t]), e += L(te[t]);
	let B = z.reduce((e, t) => e + L(t), 0);
	i(() => {
		if (!j) return;
		let e = df(j.rows, f === "all" ? ["all", ...D.filter((e) => e.ok).map((e) => e.id)] : [f]);
		w((t) => f === "all" ? e : {
			...t,
			...e
		});
	}, [j, f]);
	let V = u(), ne = s(t.repo === void 0 || t.repo === "all"), re = D.length > 1;
	i(() => {
		!ne.current && re && (ne.current = !0, V.get(E.overview("all")).then((e) => w((t) => ({
			...df(e.rows, ["all", ...D.filter((e) => e.ok).map((e) => e.id)]),
			...t
		})), () => {}));
	}, [re]);
	let H = (e) => {
		p(e), b(null), S(14), a({
			kind: "overview",
			...e === "all" ? {} : { repo: e },
			..._ ? { state: _ } : {}
		});
	}, ie = (e) => {
		v(e), S(14), a({
			kind: "overview",
			...f === "all" ? {} : { repo: f },
			...e ? { state: e } : {}
		});
	}, ae = () => setTimeout(() => T.current?.scrollIntoView?.({
		behavior: "smooth",
		block: "start"
	}), 30), U = (e) => {
		b((t) => t?.id === e.id ? null : e), S(14), ae();
	}, W = (e, t = !1) => r({
		kind: "board",
		repo: e.repo,
		key: e.key,
		...t ? { replay: !0 } : {},
		from: "overview"
	}), G = (e) => r({
		kind: "item",
		repo: e.repo,
		key: e.key,
		from: "overview"
	}), oe = (e) => j?.rows.find((t) => t.key === e)?.repo ?? (f === "all" ? D.find((e) => e.ok)?.id : f), se = (e, t = !1) => {
		let n = oe(e);
		n && (t ? G : W)({
			repo: n,
			key: e
		});
	}, le = (e, t) => {
		let n = oe(e);
		n && r({
			kind: "item",
			repo: n,
			key: e,
			from: "overview",
			decision: t
		});
	}, ue = (e) => D.find((t) => t.id === e)?.name, K = C.runner, de = f === "all" ? D.filter((e) => e.ok) : D.filter((e) => e.id === f), q = f === "all" ? void 0 : D.find((e) => e.id === f), fe = !!n && f !== "all" && !k && (!q || !q.ok), pe = de.filter((e) => e.ok), me = pe.length > 0 && pe.every((e) => e.remote === !1 || !(e.kit?.gitlab_base && e.kit?.gitlab_project)), he = f === "all" && D.length > 1, ge = !!n && (n.app.team || n.team.enabled), _e = () => r({
		kind: "new",
		...f === "all" ? {} : { repo: f }
	});
	if (O) return /* @__PURE__ */ h("main", {
		className: "kt-root br-view cto-root br-ov",
		"data-testid": "overview",
		children: /* @__PURE__ */ h(Pt, { onImport: () => r({ kind: "import" }) })
	});
	let J = j?.cto, ye = !!j && !j.cto.available && !!j.eval.computing, be = !!j && j.rows.length === 0, xe = (j?.rows ?? []).filter((e) => e.credits !== null && e.credits > 0).map((e) => ({
		key: e.key,
		credits: e.credits
	})), Se = (j?.rows ?? []).filter((e) => e.waits.who === "you" && e.state !== "closed").sort((e, t) => (e.waits.since ?? Infinity) - (t.waits.since ?? Infinity) || (t.updated_at ?? 0) - (e.updated_at ?? 0)), Ce = de.length > 1 ? "这些仓库" : "这个仓库";
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view cto-root br-ov",
		"data-testid": "overview",
		children: [
			/* @__PURE__ */ h("style", { children: sf }),
			/* @__PURE__ */ g("header", {
				className: "cto-top",
				children: [
					me && /* @__PURE__ */ h("span", {
						className: "cto-tag",
						"data-testid": "ov-local-tag",
						title: "没有远端：需求只在这台机器上做，不交给运行机",
						children: "只在本机"
					}),
					ge && /* @__PURE__ */ h("span", {
						className: "cto-tag is-real",
						title: "交给运行机的需求由团队的运行机接手",
						children: "团队模式"
					}),
					/* @__PURE__ */ h("span", {
						className: "cto-org",
						children: k ? `${D.length} 个仓库 · 现在一个都读不了` : fe ? q ? `${q.name} 还读不了` : "这个仓库不在列表里" : [n ? `${de.length} 个仓库` : "", j ? `${j.rows.length} 个需求` : "…"].filter(Boolean).join(" · ")
					}),
					/* @__PURE__ */ h("span", { className: "cto-grow" }),
					/* @__PURE__ */ h(Vf, {
						repos: pe.filter((e) => e.remote !== !1),
						onDone: A.reload
					})
				]
			}),
			D.filter((e) => e.pending && (f === "all" || e.id === f)).map((e) => /* @__PURE__ */ h(Ft, {
				repo: e,
				banner: !0,
				onOpen: () => r({
					kind: "import",
					path: e.path
				}),
				onDone: l
			}, e.id)),
			/* @__PURE__ */ h(zt, {
				loading: A.loading,
				error: A.error,
				has: !!j
			}),
			!k && j?.errors.filter((e) => !(fe && e.repo === f)).map((e) => {
				let t = D.find((t) => t.id === e.repo), n = /[\u3400-\u9fff]/.test(e.error), i = t?.path ?? e.path;
				return /* @__PURE__ */ h("div", {
					className: "br-banner",
					role: "status",
					"data-testid": "repo-error",
					children: /* @__PURE__ */ g("div", {
						className: "br-row",
						children: [
							/* @__PURE__ */ g("span", { children: [/* @__PURE__ */ g("b", {
								className: "br-strong",
								children: [t?.name ?? e.name ?? "这个仓库", "："]
							}), n ? e.error : "这次没读出来"] }),
							!n && /* @__PURE__ */ h("span", {
								className: "br-dim",
								children: "做什么：看看这个仓库的目录还在不在、能不能读，再去导入仓库检查它"
							}),
							i && /* @__PURE__ */ h("button", {
								type: "button",
								className: "br-btn is-small",
								onClick: () => r({
									kind: "import",
									path: i
								}),
								children: "去导入仓库"
							}),
							(n ? e.raw : e.error) && /* @__PURE__ */ g("details", {
								className: "br-raw",
								children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: n ? e.raw : e.error })]
							})
						]
					})
				}, e.repo);
			}),
			j && J && !be && /* @__PURE__ */ g("section", {
				className: "cto-hero",
				"data-testid": "ov-hero",
				children: [/* @__PURE__ */ h("h2", { children: J.sentence }), /* @__PURE__ */ g("p", { children: [
					J.available ? `数字来自 brain-kit 的评估（${ve("读的是", J.ref || "默认分支")}）和这个 app 开的会话` : ye ? "brain-kit 正在算评估的数字，算好就出来：下面先看 credits 和合并" : "brain-kit 的评估还没给出数字：下面先看 credits 和合并",
					" · ",
					"口径见末尾",
					!J.available && n?.brainkit.modules.evaluate === !1 && /* @__PURE__ */ g(m, { children: ["。做什么：换一个带评估模块的 brain-kit", /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-link",
						onClick: () => r({ kind: "settings" }),
						children: "去设置 ↗"
					})] })
				] })]
			}),
			j && D.length > 1 && /* @__PURE__ */ g("nav", {
				className: "cto-lines",
				"aria-label": "仓库",
				children: [[{
					id: "all",
					name: "全部"
				}, ...D].map((e) => {
					let t = e.ok === !1, n = C[e.id];
					return /* @__PURE__ */ g("button", {
						type: "button",
						"aria-pressed": f === e.id,
						disabled: t,
						onClick: () => H(e.id),
						children: [/* @__PURE__ */ h("b", { children: e.name }), t ? /* @__PURE__ */ h("span", { children: e.pending ? e.pending.word || "在分支上" : e.error?.startsWith("还没装") ? "还没装" : "读不到" }) : n ? /* @__PURE__ */ g("span", { children: [
							"进行中 ",
							n.open,
							n.you > 0 && /* @__PURE__ */ g("span", {
								className: "is-you",
								children: [" · 轮到你 ", n.you]
							})
						] }) : null]
					}, e.id);
				}), K && K.open + K.you > 0 && /* @__PURE__ */ g("button", {
					type: "button",
					"aria-pressed": y?.id === lf.id,
					"data-testid": "pill-elsewhere",
					title: "运行机在做的、这台机器没导入的项目：点一下在全部的交付清单里看它们",
					onClick: () => {
						f !== "all" && H("all"), U(lf);
					},
					children: [/* @__PURE__ */ h("b", { children: lf.label }), /* @__PURE__ */ g("span", { children: [
						"进行中 ",
						K.open,
						K.you > 0 && /* @__PURE__ */ g("span", {
							className: "is-you",
							children: [" · 轮到你 ", K.you]
						})
					] })]
				})]
			}),
			be && k && /* @__PURE__ */ h("section", {
				className: "cto-card",
				"data-testid": "ov-nokit",
				children: /* @__PURE__ */ h("p", {
					className: "cto-was",
					children: "brain-kit 读不到，这里的需求和数字要等它能读了才有：照最上面那条提示修。"
				})
			}),
			j && fe && !q?.pending && /* @__PURE__ */ h(pf, {
				repo: q,
				error: j.errors.find((e) => e.repo === f),
				onImport: (e) => r({
					kind: "import",
					...e ? { path: e } : {}
				}),
				onAll: () => H("all")
			}),
			be && !k && !fe && /* @__PURE__ */ h(Vt, {
				title: "还没有需求",
				text: [`${Ce}还没有需求。认领一个需求，交它的文档过五关，开工：它会在这里一路走到合并——在哪一步、等谁、花了多少。`],
				punch: "人只在判断点上出手：批准、回答、验收。",
				flow: me ? [
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
						icon: "release",
						title: "发布",
						text: "你批准发布，合并"
					},
					{
						icon: "brain",
						title: "回写 Brain",
						text: "学到的留下来"
					}
				] : [
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
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn is-primary is-big",
					onClick: _e,
					children: [/* @__PURE__ */ h(Y, {
						role: "new",
						size: 17
					}), "开需求"]
				})
			}),
			j && J && !be && /* @__PURE__ */ g(m, { children: [
				Se.length > 0 && /* @__PURE__ */ h(vf, {
					rows: Se,
					at: j.at,
					repoName: he ? ue : () => void 0,
					onGo: r,
					onOpen: (e) => W(e),
					onAll: () => U(mf(void 0, "you"))
				}),
				/* @__PURE__ */ g("section", {
					className: "cto-cards",
					"data-testid": "ov-cards",
					children: [
						/* @__PURE__ */ h(xf, {
							c: J,
							localOnly: me,
							computing: ye,
							pick: y,
							onPick: U,
							onKey: (e) => e.repo ? W(e) : se(e.key)
						}),
						/* @__PURE__ */ h(Sf, {
							c: J,
							computing: ye,
							onPick: U
						}),
						/* @__PURE__ */ g("article", {
							className: "cto-card",
							"aria-label": "每个需求的 credits",
							"data-anchor": "credits",
							children: [/* @__PURE__ */ h("div", {
								className: "cto-eyebrow",
								children: "每个需求的 credits"
							}), J.credits.per_req === null ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("div", {
								className: "cto-value is-word",
								"data-testid": "ov-credits",
								children: "还没有"
							}), /* @__PURE__ */ h("div", {
								className: "cto-desc",
								children: "这个 app 开的会话报了 credits 以后才有"
							})] }) : /* @__PURE__ */ g(m, { children: [
								/* @__PURE__ */ h("button", {
									type: "button",
									className: "cto-value cto-link-value",
									"data-testid": "ov-credits",
									title: "在交付清单里看有 credits 的需求",
									onClick: () => U({
										id: "credits",
										label: "有 credits 的需求",
										keep: (e) => (e.credits ?? 0) > 0
									}),
									children: ce(J.credits.per_req)
								}),
								/* @__PURE__ */ g("div", {
									className: "cto-desc",
									children: [
										"有 credits 的 ",
										J.credits.reqs,
										" 个需求，合计 ",
										ce(J.credits.total)
									]
								}),
								xe.length > 0 && /* @__PURE__ */ h(jc, {
									rows: xe,
									avg: J.credits.per_req,
									onKey: (e) => se(e)
								})
							] })]
						}),
						/* @__PURE__ */ h(Cf, {
							f: j.funnel,
							team: ge,
							steppedIn: J.stepped_in ? J.stepped_in.at_points + J.stepped_in.outside : null,
							onDecision: le,
							computing: !!j.eval.computing && j.funnel.source !== "evaluate"
						})
					]
				}),
				/* @__PURE__ */ h(Ic, {
					weeks: J.weekly,
					onWeek: (e) => U({
						id: `week:${e}`,
						label: `${yc(e)} 起的一周合并的`,
						keep: (t, n) => hf(t, n) === e
					})
				}),
				j.overlaps.length > 0 && /* @__PURE__ */ h(wf, {
					data: j,
					onKey: (e) => se(e)
				}),
				/* @__PURE__ */ h(tf, {
					rows: j.rows,
					at: j.at,
					hl: null,
					localOnly: me,
					repos: de.length,
					onOpen: (e) => W(e),
					onGo: r,
					onNew: _e,
					repoName: ue,
					onCell: (e, t) => U(mf(e, t))
				}),
				/* @__PURE__ */ g("section", {
					className: "cto-card",
					"aria-label": "交付清单",
					"data-anchor": "ledger",
					"data-testid": "ledger",
					ref: T,
					children: [
						/* @__PURE__ */ g("div", {
							className: "cto-ledger-head",
							children: [
								/* @__PURE__ */ h("h3", { children: "交付清单" }),
								/* @__PURE__ */ h(Bf, {
									counts: j.counts,
									total: j.rows.length,
									value: _,
									onPick: ie
								}),
								y && /* @__PURE__ */ g("span", {
									className: "cto-filter",
									"data-testid": "ledger-pick",
									children: [y.label, /* @__PURE__ */ h("button", {
										type: "button",
										"aria-label": `不按「${y.label}」筛选`,
										onClick: () => b(null),
										children: "✕"
									})]
								}),
								/* @__PURE__ */ g("span", {
									className: "cto-dim",
									"data-testid": "ledger-count",
									children: [
										"共 ",
										P.length,
										" 个 · 点一行打开它的需求看板"
									]
								})
							]
						}),
						/* @__PURE__ */ h("div", {
							className: "br-scroll",
							children: /* @__PURE__ */ g("table", {
								className: "cto-table br-ledger",
								"data-testid": "req-table",
								children: [/* @__PURE__ */ h("thead", { children: /* @__PURE__ */ g("tr", { children: [
									/* @__PURE__ */ h("th", { children: "需求" }),
									/* @__PURE__ */ h("th", { children: "状态" }),
									/* @__PURE__ */ h("th", { children: "Lean" }),
									/* @__PURE__ */ h("th", { children: "在等" }),
									/* @__PURE__ */ h("th", { children: "交付方式" }),
									/* @__PURE__ */ h("th", {
										className: "is-num",
										children: "credits"
									}),
									/* @__PURE__ */ h("th", { children: "MR" }),
									/* @__PURE__ */ h("th", {})
								] }) }), /* @__PURE__ */ g("tbody", { children: [P.length === 0 && /* @__PURE__ */ h("tr", {
									className: "br-empty-row",
									children: /* @__PURE__ */ g("td", {
										colSpan: 8,
										children: [
											"这个筛选下没有需求。",
											" ",
											/* @__PURE__ */ h("button", {
												type: "button",
												className: "br-link",
												onClick: () => {
													b(null), ie(void 0);
												},
												children: "看全部"
											})
										]
									})
								}), z.map((t) => {
									let n = uf(t.r), i = !ee.has(n), a = (e, a) => /* @__PURE__ */ h(Ff, {
										r: e,
										at: j.at,
										run: M.get(uf(e)),
										ev: j.eval,
										repoName: he && !a ? ue(zd(e)) : void 0,
										tree: a,
										fold: e === t.r && t.kids.length ? {
											open: i,
											onFold: () => I(n)
										} : void 0,
										onOpen: () => W(e),
										onItem: () => G(e),
										onReplay: () => W(e, !0),
										onGo: r
									}, uf(e));
									return /* @__PURE__ */ g(e, { children: [a(t.r), i && t.kids.map((e, n) => a(e, n === t.kids.length - 1 ? "last" : "mid"))] }, n);
								})] })]
							})
						}),
						R > B && /* @__PURE__ */ g("button", {
							type: "button",
							className: "kt-btn is-small",
							style: { marginTop: 10 },
							onClick: () => S((e) => e + 30),
							children: [
								"显示更多（还有 ",
								R - B,
								" 个）"
							]
						})
					]
				}),
				/* @__PURE__ */ h(zf, {
					ev: j.eval,
					noModule: n?.brainkit.modules.evaluate === !1,
					onBoard: (e) => se(e),
					onItem: (e) => se(e, !0),
					onSettings: () => r({ kind: "settings" }),
					onFamily: (e) => e.repo ? W(e) : se(e.key)
				})
			] }),
			j && !be && /* @__PURE__ */ g("details", {
				className: "cto-notes",
				children: [/* @__PURE__ */ h("summary", { children: "口径" }), /* @__PURE__ */ g("ul", { children: [
					/* @__PURE__ */ h("li", { children: "无人值守：brain-kit 评估里的「自主度」。交给运行机以后，除了必经的审批（需求、设计、计划、发布、验收），没有人做过任何事，而且交付正确（一次通过验收，合并后 14 天没有回滚、热修或缺陷）；14 天没满的、还没合并的算「还没评」，不算进分母。只在本机做的需求不交给运行机，也不算进分母。" }),
					/* @__PURE__ */ h("li", { children: "人介入：人在判断点上的动作是 Lean 的审批（批准、退回，打了批准那一行却没被接受的也算）和等人回答的问题；交接后又推了代码、允许改验收测试、平台上的手动操作，都算判断点之外。本机做的和交给运行机的需求都算。" }),
					/* @__PURE__ */ h("li", { children: "每个需求的 credits：这个 app 给需求开的 Kiro Crew 会话报的 credits 合计 ÷ 有 credits 的需求数。KiroCrew 只报 credits，没有别的用量数。" }),
					/* @__PURE__ */ g("li", { children: [
						"决定 · 谁定的：",
						/* @__PURE__ */ h(of, {}),
						"。每个决定只算一次，写了别的就算「没归类」，列出在哪一行，不猜是谁。还在分支上、没合并的需求也算；评估里的「知识有用率」只看默认分支上的引用，所以两个数的范围不一样。"
					] }),
					/* @__PURE__ */ h("li", { children: "每周合并：合并进默认分支的那一周（周一起）；交付方式同上，没评估过的合并算「还没评」。" }),
					/* @__PURE__ */ h("li", { children: "轮到你、等别人：按每个需求此刻等谁；「已等」从它开始这样等的那一刻算起。" }),
					/* @__PURE__ */ h("li", { children: "没交付就结束：交给运行机以后，运行机没能开始，或 MR 关了没合并。它不算无人值守，也不算进分母。" }),
					/* @__PURE__ */ h("li", { children: "大需求：拆成小需求的需求。已合并 = 合进大需求分支的小需求；评估里大需求那一行的介入、问题和 credits 是大需求和它的小需求加起来的。待认领：拆出来、还没人认领的小需求。" })
				] })]
			})
		]
	});
}
function pf({ repo: e, error: t, onImport: n, onAll: r }) {
	let i = t?.error || e?.error || "", a = /[\u3400-\u9fff]/.test(i), o = a ? t?.raw : i;
	return /* @__PURE__ */ g(Vt, {
		testid: "ov-unreadable",
		title: e ? `${e.name} 还读不了` : "这个仓库不在列表里",
		text: [e ? a ? i : "这次没读出来：看看这个仓库的目录还在不在、能不能读，再去导入仓库检查它" : "这个链接里的仓库已经不在这台机器的仓库列表里了：要看它就去导入仓库把它加回来。"],
		punch: "能读了，它的需求、数字和交付清单就都在这里。",
		children: [
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-primary is-big",
				onClick: () => n(e?.path),
				children: [/* @__PURE__ */ h(Y, {
					role: "import",
					size: 17
				}), "去导入仓库"]
			}),
			/* @__PURE__ */ h("button", {
				type: "button",
				className: "br-btn",
				onClick: r,
				children: "看全部"
			}),
			o && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: o })]
			})
		]
	});
}
function mf(e, t) {
	let n = [e ? `「${Fd[e]}」这一列` : "", t ? `「${Pd[t]}」` : ""].filter(Boolean).join("里");
	return {
		id: `cell:${e ?? ""}:${t ?? ""}`,
		label: `需求流动 · ${n}`,
		keep: (n) => (!e || Rd(n) === e) && (!t || Bd(n) === t && cf(n))
	};
}
function hf(e, t) {
	let n = t?.merged_at ?? (e.state === "merged" ? e.updated_at : null);
	if (n == null) return null;
	let r = ((/* @__PURE__ */ new Date(n * 1e3)).getUTCDay() + 6) % 7, i = /* @__PURE__ */ new Date((n - r * 86400) * 1e3);
	return `${i.getUTCFullYear()}-${String(i.getUTCMonth() + 1).padStart(2, "0")}-${String(i.getUTCDate()).padStart(2, "0")}`;
}
function gf(e) {
	let t = (e) => e.state === "merged" || e.state === "merged_into_parent" ? 1 : e.state === "closed" ? 2 : 0;
	return e.slice().sort((e, n) => t(e) - t(n) || (n.updated_at ?? 0) - (e.updated_at ?? 0));
}
function _f(e) {
	let t = new Set(e.filter((e) => e.family?.role === "parent").map(uf)), n = (e) => {
		let n = e.family;
		return n?.role === "child" && n.parent !== e.key && t.has(uf({
			repo: e.repo,
			key: n.parent
		})) ? uf({
			repo: e.repo,
			key: n.parent
		}) : null;
	}, r = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = n(t);
		e && r.set(e, [...r.get(e) ?? [], t]);
	}
	return e.filter((e) => !n(e)).map((e) => {
		let t = (e.family?.children ?? []).map((e) => e.key), n = (e) => t.includes(e) ? t.indexOf(e) : t.length;
		return {
			r: e,
			kids: (r.get(uf(e)) ?? []).sort((e, t) => n(e.key) - n(t.key))
		};
	});
}
function vf({ rows: e, at: t, repoName: n, onGo: r, onOpen: i, onAll: a }) {
	let o = Object.entries(e.reduce((e, t) => {
		let n = Ve(t.waits);
		return n ? {
			...e,
			[n]: (e[n] ?? 0) + 1
		} : e;
	}, {}));
	return /* @__PURE__ */ g("section", {
		className: "cto-card is-wait br-yours",
		"aria-label": "轮到你",
		"data-testid": "your-turn",
		children: [
			/* @__PURE__ */ g("div", {
				className: "cto-chart-head",
				children: [/* @__PURE__ */ h("h3", { children: "轮到你" }), /* @__PURE__ */ g("span", {
					className: "cto-dim",
					children: [
						e.length,
						" 个需求",
						o.length > 0 ? ` · ${o.map(([e, t]) => `${e} ${t}`).join(" · ")}` : ""
					]
				})]
			}),
			/* @__PURE__ */ h("ul", { children: e.slice(0, 5).map((e) => {
				let a = Vd(e), o = Hd(e, t), s = n(zd(e));
				return /* @__PURE__ */ g("li", {
					"data-key": e.key,
					children: [
						a && /* @__PURE__ */ h(Wd, {
							step: a,
							onGo: r
						}),
						/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => i(e),
							title: "打开它的需求看板",
							children: e.key
						}),
						/* @__PURE__ */ h("span", {
							className: "br-yt-title",
							children: e.title
						}),
						s && /* @__PURE__ */ h("span", {
							className: "cto-was",
							children: s
						}),
						/* @__PURE__ */ h("span", { children: e.waits.text }),
						o && /* @__PURE__ */ h("span", {
							className: "br-waited",
							children: o
						}),
						e.waits.line && /* @__PURE__ */ h(yf, {
							line: e.waits.line,
							sessionUrl: e.session_url
						})
					]
				}, uf(e));
			}) }),
			e.length > 5 && /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-link",
				style: { justifySelf: "start" },
				onClick: a,
				children: [
					"还有 ",
					e.length - 5,
					" 件：在交付清单里看全部"
				]
			})
		]
	});
}
function yf({ line: e, sessionUrl: t }) {
	let n = f(), [r, i] = c(""), a = async () => {
		try {
			await navigator.clipboard.writeText(e), i("ok");
		} catch {
			i("fail");
		}
	};
	return /* @__PURE__ */ g("span", {
		className: "br-linecopy",
		"data-testid": "line-copy",
		onClick: (e) => e.stopPropagation(),
		title: "在会话里自己打这一行：app 不会替你发",
		children: [
			/* @__PURE__ */ h("code", {
				className: "br-mono",
				children: e
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => void a(),
				children: [/* @__PURE__ */ h($, {
					name: "Copy",
					size: 13
				}), Z.copyLine]
			}),
			t && /* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				onClick: () => n(t),
				children: [/* @__PURE__ */ h($, {
					name: "MessageSquare",
					size: 13
				}), Z.openSession]
			}),
			r === "ok" && /* @__PURE__ */ h("span", {
				className: "br-small br-ok-text",
				role: "status",
				children: "已复制，去会话里自己打"
			}),
			r === "fail" && /* @__PURE__ */ h("span", {
				className: "br-small br-bad-text",
				role: "status",
				children: "没复制成：请手动选中这一行"
			})
		]
	});
}
function bf({ testid: e, why: t, computing: n = !1 }) {
	return /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("div", {
		className: "cto-value is-word",
		"data-testid": e,
		children: n ? "正在算" : "还没有"
	}), /* @__PURE__ */ h("div", {
		className: "cto-desc",
		children: n ? "brain-kit 正在算评估，算好就出来" : t
	})] });
}
function xf({ c: e, localOnly: t, computing: n, pick: r, onPick: i, onKey: a }) {
	let o = e.unattended, s = (t) => e.runs.filter((e) => e.how === t).length, c = e.runs.filter((e) => e.how === "ended"), l = (e, t) => ({
		id: `how:${e.join(",")}`,
		label: t,
		keep: (t, n) => !!n && e.includes(n.how)
	}), u = !!o && o[1] > 0 && !t;
	return /* @__PURE__ */ g("article", {
		className: `cto-card${u && o && o[0] === o[1] ? " is-ok" : ""}`,
		"aria-label": "无人值守",
		"data-anchor": "unattended",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "无人值守"
			}),
			t ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("div", {
				className: "cto-value is-word",
				"data-testid": "ov-unattended",
				children: "这次不需要"
			}), /* @__PURE__ */ h("div", {
				className: "cto-desc",
				children: "只在本机做的仓库不交给运行机；交给运行机、合并满 14 天的需求才算无人值守"
			})] }) : o ? o[1] === 0 ? /* @__PURE__ */ h(bf, {
				testid: "ov-unattended",
				why: "还没有评完的交接：交给运行机、合并满 14 天的需求才评"
			}) : /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("button", {
					type: "button",
					className: "cto-value cto-link-value",
					"data-testid": "ov-unattended",
					title: "在交付清单里看评估过的交接",
					onClick: () => i(l(["unattended", "people"], "交付方式：评估过的交接")),
					children: [o[0], /* @__PURE__ */ g("span", {
						className: "cto-of",
						children: ["/", o[1]]
					})]
				}),
				/* @__PURE__ */ h("div", {
					className: "cto-desc",
					children: "交给运行机的需求里，交接以后没人插手就做完的"
				}),
				/* @__PURE__ */ h(kc, { c: e })
			] }) : /* @__PURE__ */ h(bf, {
				testid: "ov-unattended",
				computing: n,
				why: e.available ? "交给运行机的需求合并满 14 天以后才评" : "brain-kit 的评估给出数字以后才有"
			}),
			e.runs.length > 0 && !t && /* @__PURE__ */ h("div", {
				className: "cto-legend",
				children: [...bc, "ended"].filter((e) => s(e) > 0).map((e) => /* @__PURE__ */ g("button", {
					type: "button",
					"data-how": e,
					"aria-pressed": r?.id === `how:${e}`,
					title: e === "ended" ? Mf : `在交付清单里看「${xc[e]}」的需求`,
					onClick: () => i(l([e], `交付方式：${xc[e]}`)),
					children: [
						/* @__PURE__ */ h("i", {
							className: "cto-sw",
							style: { background: Sc[e] }
						}),
						xc[e],
						/* @__PURE__ */ h("b", { children: s(e) })
					]
				}, e))
			}),
			c.length > 0 && !t && /* @__PURE__ */ h("div", {
				className: "cto-foot",
				"data-testid": "ov-ended",
				children: /* @__PURE__ */ g("span", { children: [
					"没交付就结束：",
					c.slice(0, 3).map((e, t) => /* @__PURE__ */ g("span", { children: [
						t > 0 && "、",
						/* @__PURE__ */ h("button", {
							type: "button",
							className: "br-link",
							onClick: () => a(e),
							children: e.key
						}),
						Nf(e) && `（${Nf(e)}）`
					] }, uf(e))),
					c.length > 3 && ` 等 ${c.length} 个`
				] })
			})
		]
	});
}
function Sf({ c: e, computing: t, onPick: n }) {
	let r = e.stepped_in, i = r ? r.at_points + r.outside : 0;
	return /* @__PURE__ */ g("article", {
		className: `cto-card${r && r.outside ? " is-warn" : ""}`,
		"aria-label": "人介入",
		"data-anchor": "people",
		children: [/* @__PURE__ */ h("div", {
			className: "cto-eyebrow",
			children: "人介入"
		}), r ? i === 0 ? /* @__PURE__ */ h(bf, {
			testid: "ov-people",
			why: "人在判断点上批准、退回、回答以后才有"
		}) : /* @__PURE__ */ g(m, { children: [
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "cto-value cto-link-value",
				"data-testid": "ov-people",
				title: "在交付清单里看人介入过的需求",
				onClick: () => n({
					id: "people",
					label: "人介入过的需求",
					keep: (e, t) => !!t && t.at_points + t.outside > 0
				}),
				children: [i, /* @__PURE__ */ h("span", {
					className: "cto-of",
					children: "次"
				})]
			}),
			/* @__PURE__ */ g("div", {
				className: "cto-desc",
				children: [
					r.at_points,
					" 次落在判断点上（批准、退回、回答），",
					r.outside,
					" 次在判断点之外 · 本机做的也算"
				]
			}),
			/* @__PURE__ */ h(Ac, { c: e }),
			r.outside > 0 && /* @__PURE__ */ h("div", {
				className: "cto-foot",
				children: /* @__PURE__ */ g("span", {
					className: "br-warn-text",
					children: ["判断点之外：", r.kinds.filter((e) => !e.point).map((e) => `${e.label} ${e.n}`).join("、")]
				})
			})
		] }) : /* @__PURE__ */ h(bf, {
			testid: "ov-people",
			computing: t,
			why: "brain-kit 的评估给出数字以后才有"
		})]
	});
}
function Cf({ f: e, team: t, steppedIn: n, onDecision: r, computing: i }) {
	let a = e.rows.find((e) => e.id === "person")?.count ?? 0, o = e.rows.map((e) => ({
		...e,
		label: We[e.id] ?? e.label
	}));
	return /* @__PURE__ */ g("article", {
		className: `cto-card${e.unclassified.length ? " is-warn" : ""}`,
		"aria-label": "决定 · 谁定的",
		"data-testid": "funnel-card",
		children: [
			/* @__PURE__ */ h("div", {
				className: "cto-eyebrow",
				children: "决定 · 谁定的"
			}),
			i || e.total === 0 ? /* @__PURE__ */ h(bf, {
				testid: "funnel-total",
				computing: i,
				why: "需求的决定表里有了决定以后才有"
			}) : /* @__PURE__ */ g(m, { children: [
				/* @__PURE__ */ g("div", {
					className: "cto-value",
					"data-testid": "funnel-total",
					children: [e.total, /* @__PURE__ */ h("span", {
						className: "cto-of",
						children: "个决定"
					})]
				}),
				/* @__PURE__ */ g("div", {
					className: "cto-desc",
					children: [
						"人定了 ",
						a,
						" 个 · ",
						e.source === "evaluate" ? "数字来自 brain-kit 的评估" : "app 自己数的",
						" · 没合并的需求也算"
					]
				}),
				/* @__PURE__ */ h(Mc, { rows: o }),
				/* @__PURE__ */ h("div", {
					className: "br-funnel-rows",
					children: o.filter((e) => e.count > 0).map((e) => /* @__PURE__ */ g("span", {
						"data-row": e.id,
						children: [
							/* @__PURE__ */ h("i", {
								className: "cto-sw",
								style: { background: Nc[e.id] ?? "var(--ov-ink-3)" }
							}),
							e.label,
							/* @__PURE__ */ h("b", { children: e.count })
						]
					}, e.id))
				}),
				n !== null && n > 0 && n !== a && /* @__PURE__ */ g("div", {
					className: "cto-was br-funnel-vs",
					"data-testid": "funnel-vs-people",
					children: [
						"人定的 ",
						a,
						" 个是决定表里的条数；「人介入 ",
						n,
						" 次」数的是人做的动作（批准、退回、回答），所以两个数不一样"
					]
				})
			] }),
			e.unclassified.length > 0 && /* @__PURE__ */ g("div", {
				className: "cto-foot",
				"data-testid": "funnel-unclassified",
				children: [
					/* @__PURE__ */ g("span", {
						className: "br-warn-text",
						children: [
							"没归类 ",
							e.unclassified.length,
							" 个，去改「谁定的」那一格："
						]
					}),
					e.unclassified.slice(0, 3).map((e) => /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-link",
						title: e.src ? `在 ${e.src}` : void 0,
						onClick: () => r(e.key, e.id),
						children: [
							e.key,
							" ",
							e.id,
							" ↗"
						]
					}, `${e.key}-${e.id}`)),
					e.unclassified.length > 3 && /* @__PURE__ */ g("span", {
						className: "cto-was",
						children: [
							"还有 ",
							e.unclassified.length - 3,
							" 个"
						]
					}),
					/* @__PURE__ */ h("span", {
						className: "cto-was",
						children: "写法见口径"
					})
				]
			}),
			t && /* @__PURE__ */ h("div", {
				className: "cto-foot",
				"data-testid": "funnel-questions",
				children: /* @__PURE__ */ g("span", { children: [
					"问人 ",
					_c(e.questions.asked),
					" 次 · 答了 ",
					_c(e.questions.answered),
					" · 送回运行机 ",
					_c(e.questions.delivered)
				] })
			})
		]
	});
}
function wf({ data: e, onKey: t }) {
	let n = (t) => e.rows.find((e) => e.key === t)?.owner ?? null;
	return /* @__PURE__ */ g("section", {
		className: "cto-card is-warn br-overlaps",
		"aria-label": "改同一处的需求",
		"data-testid": "overlaps",
		children: [/* @__PURE__ */ h("div", {
			className: "cto-chart-head",
			children: /* @__PURE__ */ h("h3", { children: "这些需求要改同一处" })
		}), e.overlaps.map((e, r) => {
			let i = e.keys.map(n), a = i.every((e) => e && e === i[0]);
			return /* @__PURE__ */ g("div", {
				className: "br-overlap",
				children: [
					e.keys.map((e, n) => /* @__PURE__ */ g("span", {
						className: "br-row",
						style: { gap: 4 },
						children: [
							n > 0 && /* @__PURE__ */ h("span", {
								className: "br-dim",
								children: "和"
							}),
							/* @__PURE__ */ h("button", {
								type: "button",
								className: "br-link br-key",
								onClick: () => t(e),
								children: e
							}),
							!a && /* @__PURE__ */ h("span", {
								className: "cto-was",
								children: i[n] ?? "没写负责人"
							})
						]
					}, e)),
					/* @__PURE__ */ h("span", {
						className: "br-dim",
						children: "都要改"
					}),
					e.paths.map((e) => /* @__PURE__ */ h("code", {
						className: "br-tag",
						children: e
					}, e)),
					/* @__PURE__ */ h("span", {
						className: "cto-dim",
						children: a ? `都是 ${i[0]} 的：先合一个，再做另一个，免得冲突` : "先商量好谁先合，免得冲突"
					})
				]
			}, r);
		})]
	});
}
var Tf = {
	small: "小",
	s: "小",
	xs: "很小",
	medium: "中",
	m: "中",
	large: "大",
	l: "大",
	xl: "很大"
};
function Ef(e) {
	let t = [];
	return {
		parts: e.split("现在：")[0].replace(/（([^（）]*#[^（）]*)）/g, (e, n) => (t.push(n), "")).replace(/（规模\s*([A-Za-z]+)）/g, (e, t) => Tf[t.toLowerCase()] ? `（规模${Tf[t.toLowerCase()]}）` : e).trim().split("`").map((e, t) => ({
			code: t % 2 == 1,
			text: e
		})).filter((e) => e.text),
		ids: t.join("；")
	};
}
function Df({ text: e }) {
	let t = Ef(e);
	return /* @__PURE__ */ h("div", {
		className: "br-hint br-sum",
		"data-testid": "row-summary",
		title: t.ids ? `变更说明的第一行 · ${t.ids}` : "变更说明的第一行",
		children: t.parts.map((e, t) => e.code ? /* @__PURE__ */ h("code", { children: e.text }, t) : /* @__PURE__ */ h("span", { children: e.text }, t))
	});
}
function Of({ r: e }) {
	let t = e.lean;
	if (t.done_n === void 0) return /* @__PURE__ */ h(ut, {
		lean: t,
		compact: !0
	});
	if (e.state === "claimed" || t.stage_n === null && !t.done_n && !t.skipped_n) return /* @__PURE__ */ h("span", {
		className: "cto-was",
		"data-testid": "lean-cell",
		children: "还没开工"
	});
	let n = t.next && t.next.label ? t.next : null, r = Re({
		done_n: t.done_n,
		skipped_n: t.skipped_n ?? 0,
		next: n
	}), i = t.skipped_n ?? 0;
	return /* @__PURE__ */ g("span", {
		className: "br-lean",
		"data-testid": "lean-cell",
		children: [/* @__PURE__ */ h("span", {
			className: "br-prog",
			role: "img",
			"aria-label": r,
			children: Array.from({ length: t.total }, (e, r) => /* @__PURE__ */ h("i", { className: r < t.done_n ? "is-done" : r < t.done_n + i ? "is-skipped" : n && r === t.done_n + i ? "is-next" : "" }, r))
		}), /* @__PURE__ */ h("span", { children: r.split(" · ").map((e, t) => /* @__PURE__ */ g("span", { children: [t > 0 && " · ", /* @__PURE__ */ h("span", {
			className: "br-nw",
			children: e
		})] }, t)) })]
	});
}
var kf = {
	in_progress: "info",
	ready_to_release: "wait",
	done: "ok",
	merged: "ok",
	closed: "idle",
	failed: "bad",
	unknown: "warn",
	merged_not_here: "warn"
};
function Af({ r: e, f: t, nested: n, fold: r }) {
	if (t.role === "big") return /* @__PURE__ */ h("span", {
		className: "br-chip tone-info",
		title: t.family_label || void 0,
		children: "大需求"
	});
	if (t.role === "parent") {
		let { merged: e, total: n } = Jd(t), i = kf[t.family_state ?? ""] ?? "info", a = t.family_label || void 0;
		return r ? /* @__PURE__ */ g("button", {
			type: "button",
			className: `br-chip tone-${i} br-fam-toggle`,
			"aria-expanded": r.open,
			title: `${r.open ? "收起" : "展开"}它的小需求${a ? `（${a}）` : ""}`,
			onClick: (e) => {
				e.stopPropagation(), r.onFold();
			},
			children: [
				"小需求 ",
				e,
				"/",
				n,
				" ",
				r.open ? "▾" : "▸"
			]
		}) : /* @__PURE__ */ g("span", {
			className: `br-chip tone-${i}`,
			title: a,
			children: [
				"小需求 ",
				e,
				"/",
				n
			]
		});
	}
	let i = Yd(t).filter((t) => !e.waits.text.includes(t.key));
	return /* @__PURE__ */ g(m, { children: [
		t.unit && /* @__PURE__ */ h("span", {
			className: "br-tag",
			title: "单元（unit-of-work.md）",
			children: t.unit
		}),
		!n && /* @__PURE__ */ g("span", {
			className: "cto-was",
			children: [t.parent, " 的小需求"]
		}),
		i.length > 0 && /* @__PURE__ */ g("span", {
			className: "br-chip tone-warn",
			title: i.map(Xd).join("；"),
			children: [
				"等 ",
				i.map((e) => e.key).join("、"),
				" 合进大需求"
			]
		})
	] });
}
var jf = /* @__PURE__ */ new Set(["merged", "open"]), Mf = "没交付就结束：运行机没能开始，或 MR 关了没合并", Nf = (e) => e.beyond.join("、") || e.state_label;
function Pf({ r: e, run: t }) {
	if (!t) return /* @__PURE__ */ h("span", {
		className: "cto-was",
		children: "—"
	});
	let n = t.how === "ended", r = n ? Nf(t) : "", i = !!t.state_label && !jf.has(t.state ?? "") && t.state_label !== r && !(n && t.beyond.length), a = [
		n ? Mf : "",
		t.delivery_label ? `交付：${t.delivery_label}` : "",
		!n && t.beyond.length ? `判断点之外：${t.beyond.join("、")}` : ""
	].filter(Boolean).join(" · ");
	return /* @__PURE__ */ g("span", {
		className: "br-how-cell",
		"data-how": t.how,
		title: a || void 0,
		children: [
			t.how === "pending" && e.local_only ? /* @__PURE__ */ g("span", {
				className: "br-how",
				title: "只在这台机器上做，不交给运行机：合并以后算「只在本机」",
				children: [
					/* @__PURE__ */ h("i", { style: { background: Sc.local } }),
					xc.local,
					"（还没合并）"
				]
			}) : /* @__PURE__ */ g("span", {
				className: "br-how",
				children: [
					/* @__PURE__ */ h("i", { style: { background: Sc[t.how] } }),
					xc[t.how],
					t.stuck && /* @__PURE__ */ h("span", {
						className: "br-chip tone-warn",
						title: "好久没有新动静了（brain-kit 的 stuck_hours）",
						children: "停住了"
					})
				]
			}),
			t.at_points || t.outside ? /* @__PURE__ */ g("span", {
				className: "cto-was",
				children: [/* @__PURE__ */ g("span", {
					className: "br-nw",
					children: [
						"人介入 ",
						t.at_points + t.outside,
						" 次"
					]
				}), t.outside ? /* @__PURE__ */ g("span", {
					className: "br-nw",
					children: [
						"（判断点外 ",
						t.outside,
						"）"
					]
				}) : null]
			}) : null,
			r && /* @__PURE__ */ h("span", {
				className: "cto-was",
				"data-testid": "how-why",
				children: r
			}),
			i && /* @__PURE__ */ h("span", {
				className: "cto-was",
				"data-testid": "how-state",
				children: t.state_label
			})
		]
	});
}
function Ff({ r: e, at: t, run: n, ev: r, repoName: i, tree: a, fold: o, onOpen: s, onItem: c, onReplay: l, onGo: u }) {
	let d = e.family, f = e.state === "merged" || e.state === "merged_into_parent", p = Vd(e), m = e.waits.who === "you" || e.waits.who !== "nobody" && cf(e) ? Hd(e, t) : "", _ = r.queue.find((t) => t.key === e.key), v = r.skipped.find((t) => t.key === e.key);
	return /* @__PURE__ */ g("tr", {
		"data-key": e.key,
		"data-role": d?.role ?? void 0,
		className: `cto-row-pick${f ? " is-merged" : ""}${a ? " br-kid" : ""}`,
		onClick: s,
		title: `打开它的${Z.openBoard}`,
		tabIndex: 0,
		onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && (e.preventDefault(), s()),
		children: [
			/* @__PURE__ */ g("td", {
				className: "br-col-req",
				children: [/* @__PURE__ */ g("div", {
					className: "br-row",
					style: { gap: 6 },
					children: [
						a && /* @__PURE__ */ h("span", {
							className: "br-tree",
							"aria-hidden": "true",
							children: a === "last" ? "└" : "├"
						}),
						/* @__PURE__ */ h("b", {
							className: "br-key",
							children: e.key
						}),
						/* @__PURE__ */ h("span", { children: e.title }),
						d && /* @__PURE__ */ h(Af, {
							r: e,
							f: d,
							nested: !!a,
							fold: o
						}),
						i && /* @__PURE__ */ h("span", {
							className: "cto-was",
							children: i
						}),
						e.open_questions.map((e) => /* @__PURE__ */ g("span", {
							className: "br-chip tone-wait",
							title: "还没回答的问题",
							children: [e, " 待答"]
						}, e)),
						e.overlap.length > 0 && /* @__PURE__ */ g("span", {
							className: "br-chip tone-warn",
							title: "和这些需求要改同一处",
							children: [
								"和 ",
								e.overlap.join("、"),
								" 重叠"
							]
						}),
						_ && /* @__PURE__ */ h("span", {
							className: "br-chip tone-warn",
							title: _.reasons.join("；"),
							children: "要复看"
						}),
						v && /* @__PURE__ */ h("span", {
							className: "br-chip tone-idle",
							title: v.why,
							children: "评估跳过了它"
						})
					]
				}), e.summary && /* @__PURE__ */ h(Df, { text: e.summary })]
			}),
			/* @__PURE__ */ g("td", {
				className: "br-col-nowrap",
				children: [/* @__PURE__ */ h(et, {
					state: e.state,
					label: e.state_label,
					who: e.waits.who
				}), e.updated_at !== null && /* @__PURE__ */ g("div", {
					className: "cto-was",
					children: [se(e.updated_at, t), "更新"]
				})]
			}),
			/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(Of, { r: e }) }),
			/* @__PURE__ */ g("td", {
				className: "br-col-wait",
				children: [
					/* @__PURE__ */ h("div", {
						className: e.waits.who === "you" ? "br-strong" : void 0,
						children: e.waits.text
					}),
					m && /* @__PURE__ */ h("div", {
						className: e.waits.who === "you" ? "br-waited" : "cto-was",
						children: m
					}),
					e.waits.line && /* @__PURE__ */ h(yf, {
						line: e.waits.line,
						sessionUrl: e.session_url
					}),
					p && /* @__PURE__ */ h(Wd, {
						step: p,
						onGo: u,
						primary: !1
					})
				]
			}),
			/* @__PURE__ */ h("td", { children: /* @__PURE__ */ h(Pf, {
				r: e,
				run: n
			}) }),
			/* @__PURE__ */ h("td", {
				className: "is-num",
				children: ce(e.credits)
			}),
			/* @__PURE__ */ h("td", {
				className: "br-col-nowrap",
				onClick: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ h(ft, { mr: e.mr })
			}),
			/* @__PURE__ */ h("td", {
				onClick: (e) => e.stopPropagation(),
				children: /* @__PURE__ */ g("span", {
					className: "br-acts",
					children: [/* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn is-small",
						onClick: c,
						children: Z.openDetail
					}), e.state === "merged" && /* @__PURE__ */ h("button", {
						type: "button",
						className: "kt-btn is-small",
						onClick: l,
						title: "在需求看板上从头回放",
						children: "▶ 回放"
					})]
				})
			})
		]
	});
}
var If = {
	autonomy: "交接以后没人插手、交付也正确的",
	delivery: "一次过验收、合并后 14 天没出问题的",
	judgment: "人做的事里，落在批准、退回、回答上的",
	repeat_rate: "同一个纠正又出现的（越低越好）",
	useful: "Brain 条目里被引用过的（只看默认分支）",
	staleness: "过时的引用、同名术语、覆盖或撤回的",
	credits_per_success: "每交付对一个需求花的 credits"
}, Lf = {
	autonomy: "交接以后，除了必经的审批（需求、设计、计划、发布审批和验收），没有人做过任何事，而且交付正确",
	delivery: "一次通过验收，合并后 14 天内没有回滚、修复提交，也没有新认领的缺陷",
	judgment: "判断点是 Lean 的审批（批准、退回）和等人回答的问题（本机会话里的、MR 上的）",
	repeat_rate: "同一条纠正又被提出的次数 ÷ 全部纠正（越低越好）",
	useful: "被引用过的 Brain 条目 ÷ 现有的条目",
	staleness: "过时的引用 + 同名的术语 + 这一期被覆盖或撤回的条目",
	credits_per_success: "做完的运行花的 credits 合计 ÷ 交付正确的需求数；只用来看钱花在哪，不设上限"
};
function Rf(e) {
	return e === null ? null : Array.isArray(e) ? e[1] > 0 ? `${e[0]}/${e[1]}` : null : String(e);
}
function zf({ ev: e, noModule: t, onBoard: n, onItem: r, onSettings: i, onFamily: a }) {
	let o = e.families ?? [], s = !e.available && !!e.computing, c = !s && (t || !e.error), l = e.note_rows, u = e.raw ?? (c ? e.error : "");
	return /* @__PURE__ */ g("section", {
		className: "cto-card br-eval",
		"aria-label": "brain-kit 的评估",
		"data-testid": "eval-batch",
		children: [/* @__PURE__ */ g("div", {
			className: "cto-chart-head",
			children: [/* @__PURE__ */ h("h3", { children: "brain-kit 的评估" }), /* @__PURE__ */ h("span", {
				className: "cto-dim",
				children: e.available ? `这一批：${ve(e.ref || "默认分支", "上已经有记录的需求")} · 不跟着交付清单的筛选变` : ""
			})]
		}), e.available ? /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("div", {
			className: "br-metrics",
			children: e.metrics.map((e) => {
				let t = Rf(e.value);
				return /* @__PURE__ */ g("div", {
					className: "br-metric",
					"data-metric": e.id,
					title: Lf[e.id] ?? e.rule,
					children: [
						/* @__PURE__ */ h("span", { children: e.label }),
						/* @__PURE__ */ h("b", {
							className: t === null ? "is-none" : void 0,
							children: t ?? "还没有"
						}),
						/* @__PURE__ */ h("small", { children: If[e.id] ?? e.rule })
					]
				}, e.id);
			})
		}), (o.length > 0 || e.queue.length > 0 || e.skipped.length > 0 || e.notes.length > 0) && /* @__PURE__ */ g("ul", {
			className: "br-eval-list",
			children: [
				o.map((e) => /* @__PURE__ */ g("li", {
					"data-testid": "eval-family",
					"data-family": e.key,
					children: [
						/* @__PURE__ */ h("span", {
							className: "kt-pill tone-info",
							children: "大需求"
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => a(e),
							title: "打开它的需求看板",
							children: [e.key, " ↗"]
						}),
						/* @__PURE__ */ h("span", {
							className: `br-chip tone-${kf[e.state] ?? "idle"}`,
							children: e.state_label || e.state
						}),
						/* @__PURE__ */ g("span", {
							className: "br-tag",
							"data-n": "merged",
							title: e.children.length ? `小需求：${e.children.join("、")}` : void 0,
							children: ["已合并", /* @__PURE__ */ g("b", { children: [
								e.merged,
								"/",
								e.total
							] })]
						}),
						(e.not_started?.length ?? 0) > 0 && /* @__PURE__ */ g("span", {
							className: "br-tag",
							"data-n": "not_started",
							title: e.not_started.join("、"),
							children: ["没开工", /* @__PURE__ */ h("b", { children: e.not_started.length })]
						}),
						(e.closed?.length ?? 0) > 0 && /* @__PURE__ */ g("span", {
							className: "br-tag",
							"data-n": "closed",
							title: `关了，不算在内：${e.closed.join("、")}`,
							children: ["关了", /* @__PURE__ */ h("b", { children: e.closed.length })]
						}),
						/* @__PURE__ */ g("span", {
							className: "cto-was",
							title: "大需求和它的小需求加起来",
							children: [
								/* @__PURE__ */ g("span", {
									"data-n": "at_points",
									children: ["判断点上 ", e.at_points]
								}),
								" · ",
								/* @__PURE__ */ g("span", {
									"data-n": "outside",
									children: ["判断点外 ", e.outside]
								}),
								" · ",
								/* @__PURE__ */ g("span", {
									"data-n": "questions",
									children: ["问题 ", e.questions]
								}),
								" · ",
								/* @__PURE__ */ g("span", {
									"data-n": "credits",
									children: [ce(e.credits), " credits"]
								})
							]
						})
					]
				}, `f-${e.repo}/${e.key}`)),
				e.queue.map((e) => /* @__PURE__ */ g("li", {
					"data-testid": "eval-queue",
					children: [
						/* @__PURE__ */ h("span", {
							className: "kt-pill tone-warn",
							children: "要复看"
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => n(e.key),
							children: [e.key, " ↗"]
						}),
						/* @__PURE__ */ h("span", { children: e.reasons.join("；") }),
						e.todo && /* @__PURE__ */ g("span", {
							className: "cto-was",
							children: ["做什么：", e.todo]
						})
					]
				}, `q-${e.key}`)),
				e.skipped.map((e) => /* @__PURE__ */ g("li", {
					"data-testid": "eval-skipped",
					children: [
						/* @__PURE__ */ h("span", {
							className: "kt-pill tone-idle",
							children: "跳过"
						}),
						/* @__PURE__ */ g("button", {
							type: "button",
							className: "br-link br-key",
							onClick: () => r(e.key),
							children: [e.key, " ↗"]
						}),
						/* @__PURE__ */ g("span", { children: [/* @__PURE__ */ h("span", {
							className: "br-warn-text",
							children: "读不了，不算进数字："
						}), e.why] }),
						/* @__PURE__ */ h("span", {
							className: "cto-was",
							children: "做什么：在它的分支上把这个文件改对，下一次评估就会算进来"
						}),
						e.raw && e.raw !== e.why && /* @__PURE__ */ g("details", {
							className: "br-raw",
							children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw })]
						})
					]
				}, `s-${e.key}`)),
				l ? l.map((e, t) => /* @__PURE__ */ g("li", {
					className: "cto-was",
					"data-testid": "eval-notes",
					children: [
						/* @__PURE__ */ g("span", { children: ["brain-kit 说：", e.text] }),
						e.todo && /* @__PURE__ */ g("span", { children: ["做什么：", e.todo] }),
						e.raw && e.raw !== e.text && /* @__PURE__ */ g("details", {
							className: "br-raw",
							children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw })]
						})
					]
				}, `n-${t}`)) : e.notes.length > 0 && /* @__PURE__ */ g("li", {
					className: "cto-was",
					"data-testid": "eval-notes",
					children: ["brain-kit 说：", e.notes.join("；")]
				})
			]
		})] }) : /* @__PURE__ */ g("div", {
			className: "br-note",
			style: { marginTop: 6 },
			children: [s ? /* @__PURE__ */ h("span", {
				"data-testid": "eval-computing",
				children: "正在算：brain-kit 在后台评估默认分支上的记录，算好这里和上面的数字就出来，不用刷新。"
			}) : c ? /* @__PURE__ */ g(m, { children: ["brain-kit 还没有评估模块。做什么：换一个新一点的 brain-kit，评估的数字就会出来。", /* @__PURE__ */ h("button", {
				type: "button",
				className: "br-link",
				style: { marginLeft: 6 },
				onClick: i,
				children: "去设置 ↗"
			})] }) : e.error, u && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: u })]
			})]
		})]
	});
}
function Bf({ counts: e, total: t, value: n, onPick: r }) {
	let i = rf.filter((t) => (e[t] ?? 0) > 0 || t === n);
	return /* @__PURE__ */ g("div", {
		className: "cto-seg",
		role: "group",
		"aria-label": "按状态看",
		"data-testid": "state-filter",
		children: [/* @__PURE__ */ g("button", {
			type: "button",
			"aria-pressed": !n,
			onClick: () => r(void 0),
			children: ["全部 ", t]
		}), i.map((t) => /* @__PURE__ */ g("button", {
			type: "button",
			className: `tone-${Ze[t]}`,
			"aria-pressed": n === t,
			onClick: () => r(n === t ? void 0 : t),
			children: [
				v[t],
				" ",
				e[t] ?? 0
			]
		}, t))]
	});
}
function Vf({ repos: e, onDone: t }) {
	let n = u(), r = P(async () => {
		let t = [];
		for (let r of e) t.push({
			...await n.post(E.refresh(), { repo: r.id }),
			name: r.name
		});
		return t;
	});
	if (e.length === 0) return null;
	let i = async () => {
		await r.run() && t();
	}, a = e.length > 1;
	return /* @__PURE__ */ g("span", {
		className: "br-refresh",
		children: [
			r.result?.map((e) => /* @__PURE__ */ g("span", {
				className: `br-small ${e.ok ? "br-dim" : "br-bad-text"}`,
				role: "status",
				"data-testid": "refresh-result",
				children: [
					a && `${e.name}：`,
					e.text,
					e.raw && /* @__PURE__ */ g("details", {
						className: "br-raw",
						children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw })]
					})
				]
			}, e.name)),
			r.error && /* @__PURE__ */ g("span", {
				className: "br-small br-bad-text",
				role: "alert",
				children: [
					"没取成：",
					r.error,
					"。做什么：看看网络、远端地址和你的权限，再点一次"
				]
			}),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small",
				disabled: r.busy,
				onClick: () => void i(),
				title: `从远端读最新的分支和默认分支（${e.map((e) => e.name).join("、")}），这里的数字跟着更新`,
				children: [/* @__PURE__ */ h($, {
					name: "RefreshCw",
					size: 13
				}), r.busy ? "正在取…" : "从远端取最新"]
			})
		]
	});
}
var Hf = "bridge.json：带 \"signer\": {\"type\": \"spool\", \"spool_dir\", \"allowed_signers\"}，不写 signing_key", Uf = (e) => ({
	brainkit: e.brainkit,
	work_root: e.work_root,
	team: { ...e.team }
}), Wf = (e) => ({
	brainkit: e.brainkit.trim(),
	work_root: e.work_root.trim(),
	team: { ...e.team }
}), Gf = [[
	"bridge_config",
	"桥的配置文件",
	"…/bridge.json"
], [
	"runnerd_config",
	"运行机的配置文件",
	"…/runnerd.json"
]];
function Kf(e) {
	return e.ok ? {
		word: "能用",
		tone: "ok"
	} : e.pending ? {
		word: e.pending.word || "在分支上",
		tone: "wait"
	} : /还没装 brain-kit/.test(e.error) ? {
		word: "没装",
		tone: "idle"
	} : /找不到这个目录/.test(e.error) ? {
		word: "找不到目录",
		tone: "bad"
	} : /brain-kit 没装载/.test(e.error) ? {
		word: "等 brain-kit",
		tone: "idle"
	} : /kit\.json|设置/.test(e.error) ? {
		word: "设置有问题",
		tone: "bad"
	} : {
		word: "读不了",
		tone: "bad"
	};
}
function qf({ status: e, setStatus: t, reloadStatus: n, go: r }) {
	let a = u(), o = N(E.settings(), 0), [l, d] = c(null), [f, p] = c(!1), _ = s(null), v = !!e && !e.brainkit.ok;
	i(() => {
		v && l && _.current?.focus();
	}, [v, !!l]), i(() => {
		o.data && !l && d(Uf(o.data));
	}, [o.data]);
	let y = P((e) => a.post(E.settings(), e)), b = (e) => {
		p(!1), d((t) => t && {
			...t,
			...e
		});
	}, x = (e) => b({ team: {
		...l.team,
		...e
	} }), S = async () => {
		if (!l) return;
		let e = await y.run(Wf(l));
		e && (d(Uf(e.settings)), t(e.status), p(e.ok));
	}, C = (e) => r({
		kind: "import",
		...e ? { path: e } : {}
	}), w = l && /* @__PURE__ */ g("div", {
		className: "br-field",
		children: [
			/* @__PURE__ */ h("label", {
				htmlFor: "set-brainkit",
				children: "brain-kit 在哪"
			}),
			/* @__PURE__ */ h("input", {
				id: "set-brainkit",
				ref: _,
				type: "text",
				className: "br-mono",
				value: l.brainkit,
				onChange: (e) => b({ brainkit: e.target.value })
			}),
			/* @__PURE__ */ h("p", {
				className: "br-hint",
				children: "brain-kit 检出的目录（里面有 brainkit/）。app 只读它，不改它。"
			})
		]
	}), T = /* @__PURE__ */ g("div", {
		className: "br-row",
		children: [
			/* @__PURE__ */ h("button", {
				type: "submit",
				className: "br-btn is-primary",
				disabled: y.busy,
				children: y.busy ? "正在保存…" : "保存"
			}),
			f && /* @__PURE__ */ h("span", {
				className: "br-ok-text",
				role: "status",
				children: "已保存"
			}),
			y.result && !y.result.ok && /* @__PURE__ */ h("span", {
				className: "br-bad-text",
				role: "status",
				children: "没保存成：看上面的状态"
			}),
			y.error && /* @__PURE__ */ h("span", {
				className: "br-error",
				role: "alert",
				children: y.error
			})
		]
	}), D = e && v ? Kt(e.brainkit.error, e.brainkit.path, !0) : null, O = D && e && /* @__PURE__ */ g("section", {
		className: "br-card st-kitfix is-bad",
		"aria-label": "找不到 brain-kit",
		"data-testid": "settings-no-brainkit",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "blocked",
					size: 18
				}),
				/* @__PURE__ */ h("h3", { children: D.text }),
				e.brainkit.path && /* @__PURE__ */ h("code", {
					className: "st-path",
					title: e.brainkit.path,
					children: e.brainkit.path
				})
			] }),
			/* @__PURE__ */ g("p", {
				className: "st-kitfix-todo",
				children: [/* @__PURE__ */ h("b", { children: "做什么" }), D.todo]
			}),
			D.cmd && /* @__PURE__ */ h(qt, { cmd: D.cmd }),
			l && /* @__PURE__ */ g("form", {
				className: "br-form",
				onSubmit: (e) => {
					e.preventDefault(), S();
				},
				children: [w, T]
			}),
			D.raw && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节：app 读 brain-kit 时的原话" }), /* @__PURE__ */ h("pre", { children: D.raw })]
			})
		]
	}), k = /* @__PURE__ */ g("section", {
		className: "br-card st-form",
		"aria-label": "设置",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "settings",
					size: 18
				}),
				/* @__PURE__ */ h("h3", { children: "设置" }),
				/* @__PURE__ */ h("span", {
					className: "br-dim br-small",
					children: "存在 app 自己的数据目录里"
				})
			] }),
			/* @__PURE__ */ h(zt, {
				loading: o.loading,
				error: o.error,
				has: !!l
			}),
			l && /* @__PURE__ */ g("form", {
				className: "br-form",
				onSubmit: (e) => {
					e.preventDefault(), S();
				},
				children: [
					/* @__PURE__ */ g("div", {
						className: "st-fields",
						children: [!O && w, /* @__PURE__ */ g("div", {
							className: "br-field",
							children: [
								/* @__PURE__ */ h("label", {
									htmlFor: "set-work",
									children: "每个需求的工作目录放在哪"
								}),
								/* @__PURE__ */ h("input", {
									id: "set-work",
									type: "text",
									className: "br-mono",
									value: l.work_root,
									onChange: (e) => b({ work_root: e.target.value })
								}),
								/* @__PURE__ */ h("p", {
									className: "br-hint",
									children: "要在 ~/workplace 或 ~/workspace 下面：KiroCrew 的会话只能在这两个目录里干活。"
								})
							]
						})]
					}),
					/* @__PURE__ */ g("fieldset", {
						className: `br-fieldset st-team${l.team.enabled ? " is-on" : ""}`,
						children: [
							/* @__PURE__ */ h("legend", { children: "团队模式" }),
							/* @__PURE__ */ g("div", {
								className: "st-toggle",
								children: [/* @__PURE__ */ g("label", {
									className: "br-check",
									children: [/* @__PURE__ */ h("input", {
										type: "checkbox",
										"aria-describedby": "set-team-hint",
										checked: l.team.enabled,
										onChange: (e) => x({ enabled: e.target.checked })
									}), /* @__PURE__ */ h("b", { children: "这台机器是团队运行机" })]
								}), /* @__PURE__ */ h("p", {
									className: "br-hint",
									id: "set-team-hint",
									children: "只有给团队跑交接的那台机器才勾：它看 MR 上的交接，派给运行机会话。普通组员不用管。"
								})]
							}),
							l.team.enabled && /* @__PURE__ */ g(m, { children: [
								/* @__PURE__ */ h("div", {
									className: "st-fields",
									"data-testid": "team-fields",
									children: Gf.map(([e, t, n]) => /* @__PURE__ */ g("div", {
										className: "br-field",
										children: [
											/* @__PURE__ */ h("label", {
												htmlFor: `set-${e}`,
												children: t
											}),
											/* @__PURE__ */ h("input", {
												id: `set-${e}`,
												type: "text",
												className: "br-mono",
												value: l.team[e],
												placeholder: n,
												onChange: (t) => x({ [e]: t.target.value })
											}),
											/* @__PURE__ */ h("p", {
												className: "br-hint",
												children: e === "bridge_config" ? "桥看 MR、发回答用的设置：签名服务的目录和公钥都写在这里面，不写签名私钥。" : "运行机派会话用的设置。"
											})
										]
									}, e))
								}),
								/* @__PURE__ */ g("details", {
									className: "br-raw",
									children: [/* @__PURE__ */ h("summary", { children: "细节：桥的配置文件里，签名服务那一段怎么写" }), /* @__PURE__ */ h("pre", { children: Hf })]
								}),
								/* @__PURE__ */ g("label", {
									className: "br-check",
									children: [/* @__PURE__ */ h("input", {
										type: "checkbox",
										checked: l.team.dev_same_user,
										onChange: (e) => x({ dev_same_user: e.target.checked })
									}), /* @__PURE__ */ h("span", { children: "本机试用：签名器和 app 用同一个系统用户" })]
								}),
								l.team.dev_same_user && /* @__PURE__ */ h("p", {
									className: "br-banner br-small",
									role: "note",
									"data-testid": "same-user-warning",
									children: "签名器和 app 用同一个系统用户，签名私钥这个用户就能读到，签名挡不住 app 自己：只适合本机试用，不能用在正式的运行机上。"
								})
							] })
						]
					}),
					T
				]
			})
		]
	});
	return /* @__PURE__ */ g("main", {
		className: "kt-root br-view st-root",
		"data-testid": "settings",
		children: [
			/* @__PURE__ */ h("style", { children: $f }),
			/* @__PURE__ */ g("header", {
				className: "st-top",
				children: [/* @__PURE__ */ h(Y, {
					role: "settings",
					size: 26,
					className: "st-top-icon"
				}), /* @__PURE__ */ g("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ h("h2", { children: "设置" }), /* @__PURE__ */ g("p", { children: [
						"这台机器上的 app：brain-kit、",
						Z.me,
						"、仓库、KiroCrew、团队运行机"
					] })]
				})]
			}),
			O,
			e && /* @__PURE__ */ h(Yf, {
				status: e,
				onTeam: () => r({ kind: "team" })
			}),
			/* @__PURE__ */ g("div", {
				className: "st-main",
				children: [/* @__PURE__ */ g("div", {
					className: "st-col",
					children: [e && /* @__PURE__ */ h(Xf, {
						repos: e.repos,
						kitOk: e.brainkit.ok,
						onImport: C,
						onRemoved: t,
						onChanged: n
					}), k]
				}), /* @__PURE__ */ h("div", {
					className: "st-col",
					children: e && /* @__PURE__ */ h(Qf, {
						crew: e.crew,
						onFixed: n,
						kitCard: D?.text
					})
				})]
			})
		]
	});
}
var Jf = (e) => e ? "有" : "没有";
function Yf({ status: e, onTeam: t }) {
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
	return /* @__PURE__ */ g("div", {
		className: "br-kpis st-stats",
		children: [
			/* @__PURE__ */ g("section", {
				className: `br-kpi st-stat ${e.brainkit.ok ? "is-good" : "is-broken"}`,
				"aria-label": "brain-kit",
				children: [
					/* @__PURE__ */ g("div", {
						className: "st-stat-head",
						children: [
							/* @__PURE__ */ h(Y, {
								role: "brain",
								size: 18
							}),
							/* @__PURE__ */ h("span", {
								className: "br-kpi-label",
								children: "brain-kit"
							}),
							/* @__PURE__ */ h("span", { className: "br-grow" }),
							/* @__PURE__ */ h("span", {
								className: `br-chip tone-${e.brainkit.ok ? "ok" : "bad"}`,
								children: e.brainkit.ok ? "找到了" : "找不到"
							})
						]
					}),
					/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
						className: "br-kpi-big",
						children: e.brainkit.version ?? "—"
					}), /* @__PURE__ */ h("span", {
						className: "br-kpi-of",
						children: "版本"
					})] }),
					/* @__PURE__ */ h("code", {
						className: "st-path",
						title: e.brainkit.path,
						children: e.brainkit.path || "—"
					}),
					e.brainkit.ok && /* @__PURE__ */ h("div", {
						className: "st-mods",
						"aria-label": "能做的事",
						children: Object.entries(e.brainkit.modules).map(([e, t]) => /* @__PURE__ */ g("span", {
							className: `br-chip tone-${t ? "ok" : "idle"}${t ? "" : " is-off"}`,
							title: e,
							children: [
								/* @__PURE__ */ h("i", {
									"aria-hidden": "true",
									children: t ? "✓" : "–"
								}),
								Je[e] ?? e,
								" ",
								Jf(t)
							]
						}, e))
					}),
					!e.brainkit.ok && /* @__PURE__ */ g("p", {
						className: "br-bad-text br-small",
						children: [Kt(e.brainkit.error).text, "：在上面改"]
					})
				]
			}),
			/* @__PURE__ */ g("section", {
				className: `br-kpi st-stat ${r && !i ? "is-good" : "is-warn"}`,
				"aria-label": Z.me,
				children: [
					/* @__PURE__ */ g("div", {
						className: "st-stat-head",
						children: [/* @__PURE__ */ h(Y, {
							role: "person",
							size: 18
						}), /* @__PURE__ */ h("span", {
							className: "br-kpi-label",
							children: Z.me
						})]
					}),
					/* @__PURE__ */ h("div", { children: /* @__PURE__ */ h("span", {
						className: "br-kpi-big st-user",
						children: r || "没设置"
					}) }),
					i > 0 && /* @__PURE__ */ g("p", {
						className: "br-warn-text br-small",
						children: [i, " 个仓库里 brain-kit 还不知道你是谁：在下面「仓库」那一行看一眼名字，点「保存」"]
					}),
					!r && !e.repos.some((e) => e.me) && /* @__PURE__ */ g("div", {
						className: "st-ask",
						children: [/* @__PURE__ */ h("p", {
							className: "br-warn-text br-small",
							children: "导入仓库时会问你的名字，在那里填上，点「保存」。"
						}), /* @__PURE__ */ g("details", {
							className: "br-raw",
							children: [/* @__PURE__ */ h("summary", { children: "细节：在终端里一次设好（把最后的名字换成你的 GitLab 用户名）" }), /* @__PURE__ */ h(qt, { cmd: "git config --global brain.user 你的用户名" })]
						})]
					}),
					/* @__PURE__ */ h("div", {
						className: "st-mods",
						children: /* @__PURE__ */ g("span", {
							className: `br-chip tone-${e.me.token ? "ok" : "warn"}`,
							children: [
								/* @__PURE__ */ h("i", {
									"aria-hidden": "true",
									children: e.me.token ? "✓" : "!"
								}),
								"GitLab 令牌 ",
								Jf(e.me.token)
							]
						})
					}),
					e.me.how && /* @__PURE__ */ h("div", {
						className: "br-kpi-note st-how",
						children: e.me.how
					})
				]
			}),
			/* @__PURE__ */ g("section", {
				className: `br-kpi st-stat${e.team.enabled ? e.team.ok ? " is-good" : " is-broken" : ""}`,
				"aria-label": "团队运行机",
				children: [
					/* @__PURE__ */ g("div", {
						className: "st-stat-head",
						children: [
							/* @__PURE__ */ h(Y, {
								role: "runner",
								size: 18
							}),
							/* @__PURE__ */ h("span", {
								className: "br-kpi-label",
								children: "团队运行机"
							}),
							/* @__PURE__ */ h("span", { className: "br-grow" }),
							/* @__PURE__ */ h("span", {
								className: `br-chip tone-${n.tone}`,
								children: n.label
							})
						]
					}),
					e.team.enabled ? /* @__PURE__ */ g(m, { children: [
						/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
							className: "br-kpi-big st-user",
							children: e.team.last_loop_at ? se(e.team.last_loop_at) : "还没跑过"
						}), /* @__PURE__ */ h("span", {
							className: "br-kpi-of",
							children: "上一轮"
						})] }),
						/* @__PURE__ */ g("div", {
							className: "st-mods",
							children: [
								/* @__PURE__ */ g("span", {
									className: `br-chip tone-${e.team.signer.pending ? "wait" : "idle"}`,
									children: ["等签名 ", e.team.signer.pending]
								}),
								/* @__PURE__ */ g("span", {
									className: `br-chip tone-${e.team.signer.refused ? "bad" : "idle"}`,
									children: ["拒签 ", e.team.signer.refused]
								}),
								/* @__PURE__ */ h("button", {
									type: "button",
									className: "br-btn is-small",
									onClick: t,
									children: "看运行机"
								})
							]
						}),
						e.team.loop_error && /* @__PURE__ */ g("div", {
							className: "st-ask",
							children: [/* @__PURE__ */ h("p", {
								className: "br-bad-text br-small",
								children: "上一轮有一步没成：点「看运行机」看是哪一步"
							}), /* @__PURE__ */ g("details", {
								className: "br-raw",
								children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.team.loop_error })]
							})]
						})
					] }) : /* @__PURE__ */ h("div", {
						className: "br-kpi-note st-how",
						children: "这台机器只在本机开发，不用开。"
					}),
					e.team.same_user && /* @__PURE__ */ h("p", {
						className: "br-warn-text br-small",
						role: "alert",
						children: "签名服务和 app 是同一个系统用户：它签不签都由 app 说了算，只适合本机试用"
					}),
					e.team.enabled && e.team.error && /* @__PURE__ */ h("p", {
						className: "br-error br-small",
						children: e.team.error
					})
				]
			})
		]
	});
}
function Xf({ repos: e, kitOk: t, onImport: n, onRemoved: r, onChanged: i }) {
	let a = e.filter((e) => e.ok).length;
	return /* @__PURE__ */ g("section", {
		className: "br-card",
		"aria-label": "仓库",
		children: [/* @__PURE__ */ g("header", { children: [
			/* @__PURE__ */ h(Y, {
				role: "list",
				size: 18
			}),
			/* @__PURE__ */ h("h3", { children: "仓库" }),
			/* @__PURE__ */ g("span", {
				className: "br-dim br-small",
				children: [
					e.length,
					" 个",
					e.length ? ` · 能用 ${a}` : ""
				]
			}),
			/* @__PURE__ */ h("span", { className: "br-grow" }),
			/* @__PURE__ */ g("button", {
				type: "button",
				className: "br-btn is-small is-primary",
				onClick: () => n(),
				children: [/* @__PURE__ */ h(Y, {
					role: "import",
					size: 14
				}), "导入仓库"]
			})
		] }), e.length === 0 ? /* @__PURE__ */ g("div", {
			className: "st-norepo",
			children: [/* @__PURE__ */ h("p", {
				className: "br-note",
				children: "还没有仓库：点「导入仓库」。"
			}), /* @__PURE__ */ h(Bt, {
				steps: Nt,
				label: "导入仓库的步骤"
			})]
		}) : /* @__PURE__ */ h("ul", {
			className: "st-repos",
			children: e.map((e) => /* @__PURE__ */ h(Zf, {
				r: e,
				kitOk: t,
				onImport: n,
				onRemoved: r,
				onChanged: i
			}, e.path))
		})]
	});
}
function Zf({ r: e, kitOk: t, onImport: n, onRemoved: r, onChanged: i }) {
	let a = u(), [o, s] = c(!1), l = P(() => a.post(E.repoRemove(), { path: e.path })), d = async () => {
		let e = await l.run();
		e && r(e.status);
	}, { word: f, tone: p } = Kf(e), _ = e.ok ? "ok" : e.pending ? "wait" : p === "idle" ? "idle" : "bad", v = !t && p === "idle";
	return /* @__PURE__ */ g("li", {
		className: `st-repo is-${_}`,
		"data-repo": e.id,
		children: [
			/* @__PURE__ */ g("div", {
				className: "st-repo-top",
				children: [
					/* @__PURE__ */ h("span", {
						className: "st-repo-icon",
						children: /* @__PURE__ */ h(Y, {
							role: "file",
							size: 18
						})
					}),
					/* @__PURE__ */ g("div", {
						className: "st-repo-id",
						children: [/* @__PURE__ */ g("span", {
							className: "st-repo-line",
							children: [/* @__PURE__ */ h("b", {
								className: "st-repo-name",
								children: e.name
							}), /* @__PURE__ */ h("span", {
								className: `br-chip tone-${p}`,
								children: f
							})]
						}), /* @__PURE__ */ h("code", {
							className: "st-path",
							title: e.path,
							children: e.path
						})]
					}),
					!o && /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small st-repo-rm",
						onClick: () => s(!0),
						children: "移出列表"
					})
				]
			}),
			e.kit && /* @__PURE__ */ g("div", {
				className: "st-kit",
				children: [
					/* @__PURE__ */ g("span", {
						className: "br-tag",
						children: ["需求号 ", /* @__PURE__ */ g("b", { children: [e.kit.req_prefix, "-n"] })]
					}),
					/* @__PURE__ */ g("span", {
						className: "br-tag",
						children: ["跟踪 ", /* @__PURE__ */ h("b", { children: Ye[e.kit.tracker] ?? e.kit.tracker })]
					}),
					/* @__PURE__ */ g("span", {
						className: "br-tag",
						children: ["默认分支 ", /* @__PURE__ */ h("b", { children: e.kit.default_branch })]
					}),
					e.kit.gitlab_project ? /* @__PURE__ */ g("span", {
						className: "br-tag",
						title: e.kit.gitlab_base,
						children: ["GitLab ", /* @__PURE__ */ h("b", { children: e.kit.gitlab_project })]
					}) : /* @__PURE__ */ h("span", {
						className: "br-tag",
						children: "不用 GitLab"
					})
				]
			}),
			e.error && /* @__PURE__ */ h("div", {
				className: "st-repo-why",
				children: v || /没装载/.test(e.error) ? /* @__PURE__ */ h("span", {
					className: "br-dim",
					"data-testid": "repo-waits-kit",
					children: f === "没装" ? "还没装 brain-kit：先在最上面写对 brain-kit 的位置，才能装" : "brain-kit 没装载：先在最上面写对 brain-kit 的位置，这个仓库就能读了"
				}) : /* @__PURE__ */ g(m, { children: [/* @__PURE__ */ h("span", {
					className: p === "bad" ? "br-bad-text" : "br-dim",
					children: e.error
				}), /* @__PURE__ */ h("button", {
					type: "button",
					className: "br-btn is-small",
					onClick: () => n(e.path),
					children: p === "idle" ? "去装" : "去检查"
				})] })
			}),
			e.pending && /* @__PURE__ */ h(Ft, {
				repo: e,
				onOpen: () => n(e.path),
				onDone: i
			}),
			e.me && /* @__PURE__ */ g("div", {
				className: "st-me",
				children: [/* @__PURE__ */ h("span", {
					className: "br-dim br-small",
					children: Z.me
				}), /* @__PURE__ */ h(Rt, {
					path: e.path,
					me: e.me,
					onSaved: (e) => r(e.status)
				})]
			}),
			o && /* @__PURE__ */ g("div", {
				className: "br-confirm is-danger",
				role: "group",
				"aria-label": `移出 ${e.name}`,
				children: [/* @__PURE__ */ g("span", { children: [
					"只从 app 的列表里去掉 ",
					e.name,
					"：不删文件，不动分支和工作目录。以后可以再导入。"
				] }), /* @__PURE__ */ g("div", {
					className: "br-row",
					children: [/* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small is-danger",
						disabled: l.busy,
						onClick: () => void d(),
						children: l.busy ? "正在移出…" : "移出"
					}), /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-btn is-small",
						disabled: l.busy,
						onClick: () => s(!1),
						children: "取消"
					})]
				})]
			}),
			l.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			})
		]
	});
}
function Qf({ crew: e, onFixed: t, kitCard: n }) {
	let r = n ? e.rows.map((e) => e.level === "FAIL" && !e.repo && !e.fix ? {
		...e,
		todo: `照最上面「${n}」那张卡做`
	} : e) : e.rows, i = r.filter((e) => e.level === "FAIL").length, a = r.filter((e) => e.level === "WARN").length, o = r.length - i - a;
	return /* @__PURE__ */ g("section", {
		className: `br-card${i ? " is-bad" : a ? "" : " is-ok"}`,
		"aria-label": "KiroCrew",
		children: [
			/* @__PURE__ */ g("header", { children: [
				/* @__PURE__ */ h(Y, {
					role: "laptop",
					size: 18
				}),
				/* @__PURE__ */ h("h3", { children: "KiroCrew" }),
				e.checked_at && /* @__PURE__ */ g("span", {
					className: "br-dim br-small",
					children: [se(e.checked_at), "查的"]
				}),
				/* @__PURE__ */ h("span", { className: "br-grow" }),
				o > 0 && /* @__PURE__ */ g("span", {
					className: "br-chip tone-ok",
					children: [o, " 正常"]
				}),
				a > 0 && /* @__PURE__ */ g("span", {
					className: "br-chip tone-warn",
					children: [a, " 注意"]
				}),
				i > 0 && /* @__PURE__ */ g("span", {
					className: "br-chip tone-bad",
					children: [i, " 有问题"]
				})
			] }),
			r.length > 0 && /* @__PURE__ */ h("div", {
				className: "kt-segs st-cells",
				role: "img",
				"aria-label": `${o} 正常，${a} 注意，${i} 有问题`,
				children: r.map((e, t) => /* @__PURE__ */ h("i", {
					className: `is-${tt[e.level] ?? "idle"}`,
					title: e.text
				}, t))
			}),
			/* @__PURE__ */ h(xt, {
				rows: r,
				fix: e.fix,
				onFixed: t
			})
		]
	});
}
var $f = "\n.st-root { container: st / inline-size; }\n.st-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.st-top-icon { color: var(--accent); }\n.st-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); }\n@container st (max-width: 900px) { .st-stats { grid-template-columns: minmax(0, 1fr); } }\n.st-stat { gap: .5em; }\n.st-stat.is-good { border-color: var(--kit-ok); }\n.st-stat.is-broken { border-color: var(--kit-bad); }\n.st-stat.is-warn { border-color: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.st-stat-head { display: flex; align-items: center; gap: .5em; }\n.st-stat-head .kt-role-icon { color: var(--muted); }\n.st-stat .br-kpi-big { font-size: 2.2em; }\n.st-user { word-break: break-all; }\n.st-path { display: block; font-size: .82em; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }\n.st-mods { display: flex; flex-wrap: wrap; gap: .35em; align-items: center; }\n.st-mods .br-chip { font-size: .8em; }\n.st-mods .br-chip i { font-style: normal; }\n.st-mods .br-chip.is-off { opacity: .75; border-style: dashed; }\n.st-how { white-space: normal; }\n.st-main { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); gap: var(--kit-gap-block, 16px); align-items: start; }\n@container st (max-width: 1000px) { .st-main { grid-template-columns: minmax(0, 1fr); } }\n.st-col { display: grid; gap: var(--kit-gap-block, 16px); min-width: 0; align-content: start; }\n.st-repos { list-style: none; margin: 0; padding: 0; display: grid; gap: .6em; }\n.st-repo { display: grid; gap: .5em; padding: .75em .9em; border-radius: var(--kit-r-cell, 10px); border: 1px solid var(--border); background: var(--bg-elevated, var(--card));\n  box-shadow: inset 3px 0 0 var(--st-c, transparent); }\n.st-repo.is-ok { --st-c: var(--kt-ok); }\n.st-repo.is-wait { --st-c: var(--kt-approve); border-color: var(--kit-wait); }\n.st-repo.is-bad { --st-c: var(--kt-bad); border-color: var(--kit-bad); }\n.st-repo.is-idle { --st-c: var(--muted); }\n.st-repo-top { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .2em .7em; min-width: 0; }\n.st-repo-icon { display: inline-grid; place-items: center; color: var(--st-c, var(--muted)); padding-top: .15em; }\n.st-repo-id { display: grid; gap: .15em; min-width: 0; }\n.st-repo-line { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; min-width: 0; }\n.st-repo-name { color: var(--text-strong); font-size: 1.05em; }\n.st-repo-rm { align-self: start; }\n.st-kitfix { gap: .7em; }\n.st-kitfix header h3 { color: var(--kt-bad); }\n.st-kitfix-todo { margin: 0; }\n.st-kitfix-todo b { color: var(--muted); font-weight: 650; margin-right: .5em; }\n.st-ask { display: grid; gap: .35em; justify-items: start; }\n.st-ask p { margin: 0; }\n.st-kit { display: flex; flex-wrap: wrap; gap: .35em; }\n.st-kit .br-tag { color: var(--muted); }\n.st-kit .br-tag b { color: var(--text-strong); font-weight: 650; margin-left: .3em; }\n.st-repo-why { display: flex; align-items: center; gap: .5em .8em; flex-wrap: wrap; font-size: .93em; }\n.st-me { display: flex; align-items: flex-start; gap: .4em .8em; flex-wrap: wrap; font-size: .93em; }\n.st-me > .br-dim { padding-top: .2em; }\n.st-norepo { display: grid; gap: .8em; }\n.st-fields { display: grid; grid-template-columns: repeat(auto-fit, minmax(18em, 1fr)); gap: .8em 1.2em; align-items: start; }\n.st-team { gap: .8em; }\n.st-team.is-on { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, transparent); }\n.st-toggle { display: grid; gap: .1em; }\n.st-toggle b { color: var(--text-strong); }\n.st-toggle .br-hint { padding-left: 1.6em; }\n.st-cells i.is-ok { background: var(--kt-ok); } .st-cells i.is-warn { background: var(--kt-warn); } .st-cells i.is-bad { background: var(--kt-bad); }\n", ep = [
	{
		key: "reply",
		heading: "会话在等你回话",
		icon: "laptop",
		tone: "wait",
		hint: "本机会话空着：轮到你说"
	},
	{
		key: "review",
		heading: Be,
		icon: "reviewer",
		tone: "wait",
		hint: "写代码的会话不能自己审：开一个新会话审查"
	},
	{
		key: "lean_approval",
		heading: "Lean 审批",
		icon: "req",
		tone: "wait",
		hint: "读完在会话里自己打一行批准"
	},
	{
		key: "clarify",
		heading: "本地澄清",
		icon: "question",
		tone: "wait",
		hint: "在这里回答"
	},
	{
		key: "question",
		heading: "运行机上的问题",
		icon: "question",
		tone: "wait",
		hint: "在 MR 上回答"
	},
	{
		key: "acceptance",
		heading: "等验收",
		icon: "release",
		tone: "wait",
		hint: "在 MR 上验收"
	},
	{
		key: "start",
		heading: "认领了还没开工",
		icon: "new",
		tone: "wait",
		hint: "去开需求开工"
	},
	{
		key: "child_start",
		heading: "可以开工的小需求",
		icon: "deploy",
		tone: "wait",
		hint: "你认领了，依赖都合进来了"
	},
	{
		key: "parent_release",
		heading: "等评审、发布的大需求",
		icon: "release",
		tone: "wait",
		hint: "小需求都合并了"
	},
	{
		key: "write_back",
		heading: "等回写 Brain",
		icon: "brain",
		tone: "wait",
		hint: "合并了：把学到的写回 Brain"
	},
	{
		key: "handoff_rejected",
		heading: "接手被拒",
		icon: "handover",
		tone: "bad",
		hint: "改好再交接"
	},
	{
		key: "handoff_unlabelled",
		heading: "没交出去的交接",
		icon: "handover",
		tone: "warn",
		hint: "MR 上没有交接标签"
	},
	{
		key: "closed_leftover",
		heading: "关了的需求还留着分支或 MR",
		icon: "settings",
		tone: "warn",
		hint: "用不着就删掉、关掉"
	},
	{
		key: "stuck",
		heading: "卡住了的运行",
		icon: "blocked",
		tone: "bad",
		hint: "这一步答不了了：找负责人"
	},
	{
		key: "crew",
		heading: "KiroCrew 的问题",
		icon: "settings",
		tone: "bad",
		hint: "修好了才能开工"
	}
], tp = {
	wait: "等你",
	bad: "被拒或卡住",
	warn: "看一眼"
}, np = (e) => e.kind === "question" && !e.question ? "stuck" : e.kind === "reply" && e.review ? "review" : e.kind, rp = (e) => e && /DESIGN|PLAN|INCEPTION/i.test(e) ? "design" : "req", ip = [
	{
		icon: "laptop",
		title: "会话等你",
		text: "本机会话空着，轮到你说"
	},
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
		icon: "new",
		title: "开工",
		text: "认领了还没开工"
	},
	{
		icon: "handover",
		title: "交接",
		text: "被拒或没交出去"
	},
	{
		icon: "release",
		title: "MR 上",
		text: "运行机的问题、验收"
	}
];
function ap(e) {
	let t = N(E.todo(), e.pollMs ?? 1e4), n = t.data, r = () => {
		t.reload(), e.reloadStatus();
	}, a = Date.now() / 1e3, o = s(null), [l, u] = c(!1), [d, f] = c({}), p = (e) => `${e.repo}/${e.key}`, m = n ? ep.map((e) => {
		let t = n.items.filter((t) => np(t) === e.key), r = e.key === "child_start" ? Object.values(d).filter((e) => !t.some((t) => p(t) === p(e.it))).map((e) => e.it) : [];
		return {
			...e,
			items: t,
			kept: r
		};
	}).filter((e) => e.items.length > 0 || e.kept.length > 0 || e.key === "crew" && l) : [], _ = (e, t) => {
		f((n) => ({
			...n,
			[p(e)]: {
				it: e,
				r: t
			}
		})), r();
	}, v = (e) => o.current?.querySelector(`[data-testid="todo-${e}"]`)?.scrollIntoView?.({
		block: "start",
		behavior: "smooth"
	}), y = n?.items.length, b = e.status?.counts.todo;
	return i(() => {
		y !== void 0 && b !== void 0 && y !== b && e.reloadStatus();
	}, [y, b]), /* @__PURE__ */ g("main", {
		className: "kt-root br-view td-root",
		"data-testid": "br-todo",
		ref: o,
		children: [
			/* @__PURE__ */ h("style", { children: up }),
			/* @__PURE__ */ h("style", { children: An }),
			/* @__PURE__ */ g("header", {
				className: "td-top",
				children: [/* @__PURE__ */ h(Y, {
					role: "todo",
					size: 26,
					className: "td-top-icon"
				}), /* @__PURE__ */ g("div", {
					className: "br-view-head",
					children: [/* @__PURE__ */ h("h2", { children: "待办" }), /* @__PURE__ */ h("p", { children: "等你做的事：做完一件，这里就少一件" })]
				})]
			}),
			/* @__PURE__ */ h(zt, {
				loading: t.loading,
				error: t.error,
				has: !!n
			}),
			n && n.items.length === 0 && !l && Object.keys(d).length === 0 && /* @__PURE__ */ h(Vt, {
				testid: "todo-empty",
				title: "现在没有等你做的事",
				text: ["需求走到要你动手的地方，就会出现在这里，按种类分好：会话等你回话、等你开会话审查、Lean 的审批、会话问你的澄清、认领了还没开工、交接被拒、MR 上的问题和验收，还有 KiroCrew 这边要修的；拆成小需求的，能开工的小需求、能发布的大需求，还有关了却留着分支的需求，也在这里。"],
				punch: "这一页空着，就是没有谁在等你。",
				flow: ip,
				children: /* @__PURE__ */ g("button", {
					type: "button",
					className: "br-btn",
					onClick: () => e.go({ kind: "overview" }),
					children: [/* @__PURE__ */ h(Y, {
						role: "list",
						size: 16
					}), "看交付总览"]
				})
			}),
			n && n.items.length > 0 && /* @__PURE__ */ g("div", {
				className: "br-kpi td-kpi",
				"data-testid": "todo-count",
				children: [
					/* @__PURE__ */ h("div", {
						className: "br-kpi-label",
						children: "等你做的事"
					}),
					/* @__PURE__ */ g("div", {
						className: "td-kpi-row",
						children: [/* @__PURE__ */ g("div", { children: [/* @__PURE__ */ h("span", {
							className: "br-kpi-big",
							children: n.items.length
						}), /* @__PURE__ */ h("span", {
							className: "br-kpi-of",
							children: "件"
						})] }), /* @__PURE__ */ h("div", {
							className: "td-cells",
							role: "img",
							"aria-label": m.map((e) => `${e.heading} ${e.items.length}`).join("，"),
							children: m.flatMap((e) => e.items.map((t, n) => /* @__PURE__ */ h("i", {
								className: `is-${e.tone}`,
								title: `${e.heading}：${t.key || t.title}`
							}, `${e.key}-${n}`)))
						})]
					}),
					/* @__PURE__ */ h("nav", {
						className: "td-jumps",
						"aria-label": "待办的种类",
						children: m.map((e) => /* @__PURE__ */ g("button", {
							type: "button",
							className: `td-jump is-${e.tone}`,
							onClick: () => v(e.key),
							title: e.hint,
							children: [
								/* @__PURE__ */ h(Y, {
									role: e.icon,
									size: 15
								}),
								e.heading,
								" ",
								/* @__PURE__ */ h("b", { children: e.items.length })
							]
						}, e.key))
					})
				]
			}),
			m.length > 0 && /* @__PURE__ */ h("div", {
				className: "td-groups",
				children: m.map((t) => /* @__PURE__ */ g("section", {
					className: `td-group is-${t.tone}`,
					"aria-label": t.heading,
					"data-testid": `todo-${t.key}`,
					children: [
						/* @__PURE__ */ g("header", {
							className: "td-group-head",
							children: [
								/* @__PURE__ */ h("span", {
									className: "td-group-icon",
									children: /* @__PURE__ */ h(Y, {
										role: t.icon,
										size: 20
									})
								}),
								/* @__PURE__ */ h("h3", { children: t.heading }),
								/* @__PURE__ */ h("span", {
									className: `kt-badge td-badge is-${t.tone}`,
									children: t.items.length
								}),
								/* @__PURE__ */ h("span", {
									className: "br-dim br-small",
									children: t.hint
								})
							]
						}),
						n?.team && t.key === "question" && /* @__PURE__ */ h("p", {
							className: "br-note",
							"data-testid": "todo-team",
							children: "运行机的面板不收这些回答：在 GitLab 的 MR 上回答，那里认得出是谁。"
						}),
						t.key === "crew" && e.status ? /* @__PURE__ */ h("article", {
							className: "td-item is-bad td-crew",
							"data-kind": "crew",
							children: /* @__PURE__ */ h(xt, {
								rows: e.status.crew.rows,
								only: ["FAIL"],
								fix: e.status.crew.fix,
								onFixed: r,
								onHold: u
							})
						}) : /* @__PURE__ */ h("div", {
							className: "td-items",
							children: [...t.items, ...t.kept].map((n, i) => /* @__PURE__ */ h(lp, {
								it: n,
								group: t,
								now: a,
								...e,
								onAnswered: r,
								started: d[p(n)]?.r ?? null,
								onStarted: (e) => _(n, e)
							}, `${p(n)}-${i}`))
						})
					]
				}, t.key))
			})
		]
	});
}
var op = (e) => e.path || null;
function sp({ path: t }) {
	return /* @__PURE__ */ g("p", {
		className: "td-do td-read",
		"data-testid": "todo-read",
		children: [/* @__PURE__ */ h("b", { children: "要读的：" }), t.split(" + ").map((t, n) => /* @__PURE__ */ g("span", { children: [n > 0 && "、", /* @__PURE__ */ h("code", {
			className: "br-mono",
			children: t.split("/").map((t, n, r) => /* @__PURE__ */ g(e, { children: [/* @__PURE__ */ g("span", {
				className: "td-seg",
				children: [t, n < r.length - 1 && "/"]
			}), n < r.length - 1 && /* @__PURE__ */ h("wbr", {})] }, n))
		})] }, t))]
	});
}
var cp = (e) => `交接被拒了：${e.replace(/^(接手被拒|交接被拒)[：:]\s*/, "")}。请按这个原因改好，再交接一次。`;
function lp({ it: e, group: t, now: n, go: r, onAnswered: i, started: a, onStarted: o }) {
	let s = f(), c = u(), l = P((t) => c.post(E.childStart(e.repo, e.key), t)), d = e.kind === "lean_approval" ? rp(e.approval) : t.icon, p = e.session?.url ?? null, m = e.kind === "handoff_rejected" && p ? cp(e.text) : e.line, _ = e.question && (e.kind === "question" || e.kind === "clarify" || e.kind === "acceptance"), v = e.mr_url ?? e.question?.mr_url ?? null, y = t.key === "question" ? Z.answerOnMr : t.key === "acceptance" ? Z.acceptOnMr : t.key === "handoff_unlabelled" ? X.label_handoff : Z.viewMr, b = t.key === "question" || t.key === "acceptance" || t.key === "handoff_unlabelled" || t.key === "stuck", x = async () => {
		let e = await l.run({ open_session: !0 });
		e && o(e);
	}, S = e.kind === "child_start" && !a?.ok;
	return /* @__PURE__ */ g("article", {
		className: `td-item is-${t.tone}`,
		"data-testid": "todo-item",
		"data-kind": e.kind,
		"aria-label": `${t.heading} ${e.key || e.title}`,
		children: [
			/* @__PURE__ */ g("div", {
				className: "td-item-top",
				children: [
					/* @__PURE__ */ h("span", {
						className: "td-item-icon",
						title: tp[t.tone],
						children: /* @__PURE__ */ h(Y, {
							role: d,
							size: 18
						})
					}),
					e.key ? /* @__PURE__ */ h("button", {
						type: "button",
						className: "br-link br-key",
						title: `打开${Z.openDetail}`,
						onClick: () => r({
							kind: "item",
							repo: e.repo,
							key: e.key,
							from: "todo"
						}),
						children: e.key
					}) : null,
					/* @__PURE__ */ h("b", {
						className: "td-title",
						children: e.title
					}),
					/* @__PURE__ */ h("span", { className: "br-grow" }),
					e.approval && /* @__PURE__ */ h("span", {
						className: "br-chip tone-wait",
						children: ke(e.approval)
					}),
					e.since !== null && /* @__PURE__ */ g("span", {
						className: "br-dim br-small",
						title: "从它这样等着你的那一刻算起",
						children: ["已等 ", he(n - e.since)]
					})
				]
			}),
			e.text && /* @__PURE__ */ h("p", {
				className: "td-text",
				children: e.text
			}),
			e.kind === "lean_approval" && op(e) && /* @__PURE__ */ h(sp, { path: op(e) }),
			t.key === "stuck" && /* @__PURE__ */ g("p", {
				className: "td-do",
				children: [/* @__PURE__ */ h("b", { children: "做什么" }), "找这个需求的负责人，在 MR 上决定重开还是关掉它。"]
			}),
			e.todo && /* @__PURE__ */ g("p", {
				className: "td-do",
				"data-testid": "todo-do",
				children: [/* @__PURE__ */ h("b", { children: "做什么" }), e.todo]
			}),
			m && (e.kind === "lean_approval" || e.kind === "reply" || e.kind === "handoff_rejected") && /* @__PURE__ */ h(ht, {
				line: m,
				sessionUrl: p,
				said: e.kind === "lean_approval"
			}),
			_ && /* @__PURE__ */ h(Ir, {
				q: e.question,
				repo: e.repo,
				reqKey: e.key,
				mrUrl: null,
				onAnswered: i
			}),
			e.raw && /* @__PURE__ */ g("details", {
				className: "br-raw",
				children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: e.raw })]
			}),
			e.kind === "child_start" && a && /* @__PURE__ */ h(wn, {
				r: a,
				onOpen: s
			}),
			l.error && /* @__PURE__ */ h("p", {
				className: "br-error",
				role: "alert",
				children: l.error
			}),
			/* @__PURE__ */ g("div", {
				className: "td-acts",
				children: [
					S && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						disabled: l.busy,
						onClick: () => void x(),
						title: "从大需求的分支开它的工作目录，再开一个 brain-dev 会话",
						children: [/* @__PURE__ */ h(Y, {
							role: "deploy",
							size: 14
						}), l.busy ? "正在开工…" : Z.start]
					}),
					e.kind === "start" && e.key && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						onClick: () => r({
							kind: "new",
							repo: e.repo,
							key: e.key,
							title: e.title
						}),
						children: [/* @__PURE__ */ h(Y, {
							role: "new",
							size: 14
						}), X.start]
					}),
					t.key === "write_back" && e.key && /* @__PURE__ */ g("button", {
						type: "button",
						className: "br-btn is-small is-primary",
						onClick: () => r({
							kind: "brain",
							repo: e.repo,
							reflect: e.key
						}),
						children: [/* @__PURE__ */ h(Y, {
							role: "brain",
							size: 14
						}), X.write_back]
					}),
					v && b && /* @__PURE__ */ h(dt, {
						href: v,
						className: `br-btn is-small${t.tone !== "bad" || t.key === "stuck" ? " is-primary" : ""}`,
						children: y
					}),
					t.key === "review" && e.key && /* @__PURE__ */ h(Vr, {
						repo: e.repo,
						reqKey: e.key,
						liveSlot: e.session?.slot ?? null,
						worktree: null
					}),
					p && !m && e.kind !== "start" && t.key !== "review" && /* @__PURE__ */ g("button", {
						type: "button",
						className: `br-btn is-small${e.kind === "reply" ? " is-primary" : ""}`,
						onClick: () => s(p),
						children: [/* @__PURE__ */ h($, {
							name: "MessageSquare",
							size: 13
						}), e.kind === "reply" ? X.reply : Z.openSession]
					}),
					v && !b && /* @__PURE__ */ h(dt, {
						href: v,
						className: "br-btn is-small",
						children: Z.viewMr
					}),
					/* @__PURE__ */ h("span", { className: "br-grow" }),
					e.key && /* @__PURE__ */ g("button", {
						type: "button",
						className: `br-btn is-small${e.kind === "parent_release" ? " is-primary" : ""}`,
						title: e.kind === "parent_release" ? "在大需求的需求看板上评审、发布" : "在需求看板上看它走到哪了",
						onClick: () => r({
							kind: "board",
							repo: e.repo,
							key: e.key,
							from: "todo"
						}),
						children: [/* @__PURE__ */ h($, {
							name: "LayoutDashboard",
							size: 13
						}), Z.openBoard]
					})
				]
			})
		]
	});
}
var up = "\n.td-top { display: flex; align-items: center; gap: .6em 1em; flex-wrap: wrap; }\n.td-top-icon { color: var(--accent); }\n.td-root { --td-wait: var(--kt-approve); --td-bad: var(--kt-bad); --td-warn: var(--kt-warn); }\n.td-root .is-wait { --td-c: var(--td-wait); --td-b: var(--kit-wait); }\n.td-root .is-bad { --td-c: var(--td-bad); --td-b: var(--kit-bad); }\n.td-root .is-warn { --td-c: var(--td-warn); --td-b: color-mix(in srgb, var(--kt-warn) 55%, var(--border)); }\n.td-kpi { gap: .6em; border-color: var(--kit-wait); }\n.td-kpi-row { display: flex; align-items: center; gap: .8em 1.6em; flex-wrap: wrap; }\n.td-cells { display: flex; flex-wrap: wrap; gap: 4px; flex: 1 1 18em; }\n.td-cells i { width: 1.9em; height: 1.9em; border-radius: .5em; border: 2px solid var(--td-c); background: color-mix(in srgb, var(--td-c) 22%, transparent); }\n.td-cells i.is-wait { animation: kt-blink 2.4s ease-in-out infinite; }\n@media (prefers-reduced-motion: reduce) { .td-cells i.is-wait { animation: none; } }\n.td-jumps { display: flex; flex-wrap: wrap; gap: .4em; }\n.td-jump { appearance: none; font: inherit; font-size: .88em; display: inline-flex; align-items: center; gap: .4em; padding: .25em .8em; border-radius: 999px; cursor: pointer;\n  color: var(--text); background: color-mix(in srgb, var(--td-c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--td-c) 45%, transparent); }\n.td-jump .kt-role-icon { color: var(--td-c); }\n.td-jump b { color: var(--text-strong); }\n.td-jump:hover { border-color: var(--td-c); }\n.td-groups { columns: 3 30em; column-gap: var(--kit-gap-block, 16px); }\n@container br-app (max-width: 1100px) { .td-groups { columns: 2 22em; } }\n@container br-app (max-width: 720px) { .td-groups { columns: 1; } }\n.td-group { display: grid; gap: .7em; break-inside: avoid; margin-bottom: 1.4em; }\n.td-group-head { display: flex; align-items: center; gap: .4em .7em; flex-wrap: wrap; }\n.td-group-head h3 { font-size: 1.1em; }\n.td-group-icon { display: grid; place-items: center; width: 2.1em; height: 2.1em; border-radius: .6em; color: var(--td-c);\n  border: 1px solid color-mix(in srgb, var(--td-c) 50%, var(--border)); background: color-mix(in srgb, var(--td-c) 12%, transparent); }\n.td-root span.td-badge { --kt-tone: var(--td-c); font-size: .8em; }\n.td-items { display: grid; gap: var(--kit-gap-row, 12px); }\n.td-item { display: grid; gap: .6em; align-content: start; padding: .9em 1.1em; border-radius: var(--kit-r, 16px); background: var(--card);\n  border: 1px solid var(--td-b, var(--border)); box-shadow: inset 3px 0 0 var(--td-c, transparent); }\n.td-item-top { display: flex; align-items: center; gap: .4em .6em; flex-wrap: wrap; }\n.td-item-icon { display: inline-grid; place-items: center; color: var(--td-c); }\n.td-title { color: var(--text-strong); font-weight: 700; }\n.td-text { margin: 0; white-space: pre-wrap; word-break: break-word; color: var(--text); }\n.td-do { margin: 0; font-size: .93em; color: var(--text); }\n.td-do b { color: var(--muted); font-weight: 650; margin-right: .5em; }\n.td-read b { margin-right: 0; }\n.td-read .td-seg { white-space: nowrap; }\n.td-acts { display: flex; align-items: center; gap: .5em; flex-wrap: wrap; }\n.td-acts a.br-btn { text-decoration: none; }\n.td-acts .kt-btn { padding: 4px 10px; font-size: .84em; border-radius: 8px; display: inline-flex; align-items: center; gap: 5px; }\n.td-acts .br-note, .td-acts .br-error { flex-basis: 100%; margin: 0; }\n.td-acts a.br-btn.is-primary { color: var(--accent-fg, #fff); }\n", dp = 3e4;
function fp({ pollMs: e } = {}) {
	let [t, r] = c(() => ({
		...ie(window.location.search),
		n: 0
	})), [a, o] = c(() => yp(ie(window.location.search), gp())), l = u(), [p, m] = c(!1), [_, v] = c(null), y = n((e, t, n) => {
		let r = `${e}/${t}`;
		v((e) => n ? r : e === r ? null : e);
	}, []), b = f(), x = d(), S = s(null), C = s(ie(window.location.search)), w = s(C.current.kind === "overview" ? C.current : { kind: "overview" }), T = N(E.status(), e ?? 3e4), D = T.data?.counts.todo ?? 0;
	i(() => {
		T.data && x(D);
	}, [D, !!T.data]);
	let O = n((e) => {
		C.current = e, e.kind === "overview" && (w.current = e), o((t) => {
			let n = yp(e, t);
			return n !== t && _p(n), n;
		});
	}, []), A = (e) => `${window.location.pathname}${ae(e)}`, j = () => Number(window.history.state?.brDepth ?? 0), M = n((e) => {
		O(e);
		try {
			window.history.replaceState({
				...window.history.state ?? {},
				brDepth: j()
			}, "", A(e));
		} catch {}
	}, [O]), P = n((e) => {
		let t = j() + 1, n = A(e);
		O(e), r((t) => ({
			...e,
			n: t.n + 1
		})), b(n);
		let i = () => {
			let e = window.history.state;
			`${window.location.pathname}${window.location.search}` === n && e?.brDepth === void 0 && window.history.replaceState({
				...e ?? {},
				brDepth: t
			}, "", n);
		};
		i(), setTimeout(i, 0), setTimeout(i, 60);
	}, [O, b]);
	i(() => {
		let e = () => {
			let e = ie(window.location.search);
			O(e), r((t) => ({
				...e,
				n: t.n + 1
			}));
		};
		return window.addEventListener("popstate", e), () => window.removeEventListener("popstate", e);
	}, [O]), i(() => {
		t.n && S.current?.scrollIntoView?.({ block: "start" });
	}, [t.n]);
	let ee = n((e) => {
		M(e), r((t) => ({
			...e,
			n: t.n + 1
		}));
	}, [M]), F = n((e) => j() > 0 ? window.history.back() : P(e), [P]), te = n((e) => {
		if (e === "overview") return P(w.current);
		if (e === "item" || e === "board") {
			if (a) return P({
				kind: e,
				...a
			});
			m(!0), l.get(E.overview("all")).then((t) => {
				let n = vp(t.rows);
				P(n ? {
					kind: e,
					repo: n.repo,
					key: n.key
				} : w.current);
			}, () => P(w.current)).finally(() => m(!1));
			return;
		}
		let t = bp(C.current);
		if (e === "new") return P({
			kind: "new",
			...t ? { repo: t } : {}
		});
		if (e === "brain") return P({
			kind: "brain",
			...t ? { repo: t } : {}
		});
		P({ kind: e });
	}, [
		P,
		a,
		l
	]), I = n((e) => {
		let t = C.current.kind;
		if (e.kind === "item" && !e.from && (t === "overview" || t === "todo" || t === "brain" || t === "board" || t === "team") || e.kind === "board" && !e.from && (t === "overview" || t === "item" || t === "todo")) return P({
			...e,
			from: t
		});
		P(e);
	}, [P]), L = {
		status: T.data,
		go: I,
		replace: M,
		reloadStatus: T.reload,
		setStatus: T.set,
		pollMs: e
	}, { n: R, ...z } = t, B;
	if (z.kind === "item") {
		let { kind: e, ...t } = z, n = t.from === "todo" ? { kind: "todo" } : t.from === "brain" ? {
			kind: "brain",
			repo: t.repo
		} : t.from === "board" ? {
			kind: "board",
			repo: t.repo,
			key: t.key
		} : t.from === "team" ? { kind: "team" } : w.current, { decision: r, ...i } = t;
		B = /* @__PURE__ */ h(Zl, {
			entry: t,
			onBack: () => F(n),
			onSwitch: (e, t) => ee({
				kind: "item",
				...i,
				repo: e,
				key: t
			}),
			onMissing: (e) => y(t.repo, t.key, e),
			...L
		}, R);
	} else if (z.kind === "board") {
		let { kind: e, ...t } = z, n = t.from === "todo" ? { kind: "todo" } : t.from === "item" ? {
			kind: "item",
			repo: t.repo,
			key: t.key
		} : w.current;
		B = /* @__PURE__ */ h(Ds, {
			entry: t,
			onBack: t.from ? () => F(n) : void 0,
			...L,
			onSwitch: (e, n) => ee({
				kind: "board",
				repo: e,
				key: n,
				...t.from ? { from: t.from } : {}
			}),
			onMissing: (e) => y(t.repo, t.key, e)
		}, R);
	} else if (z.kind === "new") {
		let { kind: e, ...t } = z;
		B = /* @__PURE__ */ h(Td, {
			entry: t,
			...L
		}, R);
	} else if (z.kind === "brain") {
		let { kind: e, ...t } = z;
		B = /* @__PURE__ */ h($s, {
			entry: t,
			...L
		}, R);
	} else if (z.kind === "todo") B = /* @__PURE__ */ h(ap, { ...L }, R);
	else if (z.kind === "team") B = /* @__PURE__ */ h(Dl, { ...L }, R);
	else if (z.kind === "settings") B = /* @__PURE__ */ h(qf, { ...L }, R);
	else if (z.kind === "import") {
		let { kind: e, ...t } = z;
		B = /* @__PURE__ */ h(Hu, {
			entry: t,
			...L
		}, R);
	} else {
		let { kind: e, ...t } = z;
		B = /* @__PURE__ */ h(ff, {
			entry: t,
			...L
		}, R);
	}
	let V = T.data, ne = V && V.brainkit.ok && z.kind !== "new" && z.kind !== "settings" && z.kind !== "todo" ? V.crew.rows.filter((e) => e.level === "FAIL") : [], re = T.error ? k(T.status) : null, H = V && !V.brainkit.ok && z.kind !== "settings" ? Kt(V.brainkit.error, V.brainkit.path) : null;
	return /* @__PURE__ */ g("div", {
		ref: S,
		className: "br-app",
		"data-testid": "br-app",
		children: [
			/* @__PURE__ */ h("style", { children: ks }),
			/* @__PURE__ */ h("style", { children: Ms }),
			/* @__PURE__ */ h("style", { children: Rs }),
			/* @__PURE__ */ h("style", { children: Fs }),
			/* @__PURE__ */ h("style", { children: pp }),
			/* @__PURE__ */ h(Xt, {
				view: z.kind,
				onView: te,
				item: a?.key,
				gone: !!a && _ === `${a.repo}/${a.key}`,
				picking: p,
				todo: D,
				team: !!V?.app.team
			}),
			/* @__PURE__ */ g("div", {
				className: "br-banners",
				"data-testid": "br-banners",
				children: [
					re && /* @__PURE__ */ h(mp, {
						text: `${V ? "状态刷新没成：" : ""}${re.text}`,
						todo: re.todo,
						raw: T.raw,
						bad: !V,
						testid: "br-status-error",
						children: /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small",
							onClick: () => T.reload(),
							children: "再试一次"
						})
					}),
					H && /* @__PURE__ */ g(mp, {
						text: H.text,
						todo: H.todo,
						raw: H.raw,
						bad: !0,
						testid: "br-no-brainkit",
						children: [H.cmd && /* @__PURE__ */ h(qt, { cmd: H.cmd }), /* @__PURE__ */ h("button", {
							type: "button",
							className: "br-btn is-small is-primary",
							onClick: () => P({ kind: "settings" }),
							children: H.kind === "missing" ? "去填位置" : "去设置"
						})]
					}),
					ne.length > 0 && /* @__PURE__ */ g("div", {
						className: "br-banner is-error",
						"data-testid": "br-crew-fail",
						children: [/* @__PURE__ */ g("b", {
							className: "br-strong",
							children: [
								"KiroCrew 这边有 ",
								ne.length,
								" 件要先处理"
							]
						}), /* @__PURE__ */ h(xt, {
							rows: ne,
							fix: V?.crew.fix,
							onFixed: () => T.reload()
						})]
					})
				]
			}),
			B
		]
	});
}
var pp = "\n.br-app { container: br-app / inline-size; width: 100%; }\n.br-tabs button.is-off { color: var(--muted); }\n.br-tabs button.is-off[aria-selected=\"true\"] { border-bottom-color: color-mix(in srgb, var(--muted) 70%, transparent); }\n.br-shell-row { display: flex; align-items: baseline; gap: 4px 12px; flex-wrap: wrap; }\n.br-shell-row .br-prob-todo { display: inline-flex; gap: 6px; }\n.br-shell-row .br-prob-todo b { color: var(--muted); font-weight: 650; }\n";
function mp({ text: e, todo: t, raw: n, bad: r, testid: i, children: a }) {
	return /* @__PURE__ */ h("div", {
		className: `br-banner${r ? " is-error" : ""}`,
		role: "alert",
		"data-testid": i,
		children: /* @__PURE__ */ g("div", {
			className: "br-shell-row",
			children: [
				/* @__PURE__ */ h("b", {
					className: "br-strong",
					children: e
				}),
				/* @__PURE__ */ g("span", {
					className: "br-prob-todo",
					children: [/* @__PURE__ */ h("b", { children: "做什么" }), t]
				}),
				a,
				n && /* @__PURE__ */ g("details", {
					className: "br-raw",
					children: [/* @__PURE__ */ h("summary", { children: "细节" }), /* @__PURE__ */ h("pre", { children: n })]
				})
			]
		})
	});
}
var hp = "brain.app.held";
function gp() {
	try {
		let e = JSON.parse(window.localStorage.getItem(hp) || "null");
		return e && typeof e.repo == "string" && typeof e.key == "string" ? {
			repo: e.repo,
			key: e.key
		} : null;
	} catch {
		return null;
	}
}
function _p(e) {
	try {
		e && window.localStorage.setItem(hp, JSON.stringify(e));
	} catch {}
}
function vp(e) {
	if (!e.length) return null;
	let t = (e) => e.updated_at ?? 0, n = e.filter((e) => e.waits.who === "you");
	return n.length ? [...n].sort((e, n) => t(n) - t(e))[0] : [...e].sort((e, n) => t(n) - t(e))[0];
}
function yp(e, t) {
	return e.kind !== "item" && e.kind !== "board" || t && t.repo === e.repo && t.key === e.key ? t : {
		repo: e.repo,
		key: e.key
	};
}
function bp(e) {
	return "repo" in e && e.repo && e.repo !== "runner" ? e.repo : void 0;
}
//#endregion
export { dp as STATUS_POLL_MS, fp as default, vp as pickRequirement };
