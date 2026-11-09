# Brain 交付（KiroCrew app）

在 KiroCrew 里用 [brain-kit](https://github.com/warren830/brain-kit) 交付需求：认领需求，材料过五道关，在 brain-dev
会话里按 [AI-DLC Lean](https://github.com/warren830/aidlc-lean) 开发，交给团队运行机，跟进问题，维护仓库里的 Brain。

这个仓库是 KiroCrew 的一个应用来源。`apps/brain/` 是装好就能用的 app：界面已经构建好，brain-kit 和 Lean 也在里面。
安装时不用 node，也不用另外装 brain-kit。各部分的版本见 `apps/brain/VERSIONS`。

## 1. 前提

1. KiroCrew 0.11 或更新，已经装好并登录。
2. macOS 或 Linux。Windows：用 WSL 里的 KiroCrew。
3. 这台机器上有 `git` 和 `python3`（3.8 或更新）。macOS 上没有的话，运行 `xcode-select --install`。

## 2. 安装

1. KiroCrew 侧边栏 → **Apps** → **Discover（发现）**。
2. 点 Discover 右上角的齿轮（Sources / 来源）→ **管理应用来源（Manage app sources）** → **添加注册表（Add Registry）**。
3. 仓库填 `https://github.com/warren830/kirocrew-apps`，分支填 `main`，保存。显示名称可以不填。
4. 回到 Discover，找到 **Brain 交付** → **安装（Install）**。找不到就点 **同步应用（Sync apps）**。
   安装只是从 GitHub 拷文件，不跑 npm，也不跑 pip。KiroCrew 装之前会先连它的官方应用目录（apps.crew.kiro.dev），
   确认没有同名的官方 app；连不上就拒绝安装，过一会儿再试。
5. 点 **启用（Enable）**。会弹信任确认：**这个 app 和 KiroCrew 同等权限运行**（它的代码跑在 KiroCrew 里，能读写你的文件、
   运行命令）。只装你信任的。它还会请你同意 sessionApproval：app 可以让它自己开的会话不用逐个批准工具调用。

## 3. 第一次打开

1. 侧边栏打开 **Brain 交付** → **设置**。
2. 看 **KiroCrew** 那张卡：不是绿色的行，点它的修复按钮（扳手图标）。常见两条：
   - 没有 brain-dev，或缺 Lean 的 hook：点「补上 brain-dev 的 Lean hook」。它写 `~/.kiro/agents/brain-dev.json`，
     已有的文件先留一份备份。修完要开新会话。
   - 引擎不是 kas：点「把引擎换成 kas」。可能要重启 KiroCrew。
3. **brain-kit** 那张卡应该是绿的。「brain-kit 在哪」是 app 自带的那份（路径以 `apps/brain/vendor/brain-kit` 结尾），不用改。
4. 点右上的 **导入仓库**，导入你的项目仓库。
5. GitLab（仓库用 GitLab 时）：
   - 用户名：导入时检查里「你是谁」那一行（以后在 **设置** 的「仓库」里也能改），填你的 GitLab 用户名。
   - token：在 GitLab 网页上建一个有 `api` 权限的个人 token。自己把它存进 `~/.brain/gitlab-token`，再运行
     `chmod 600 ~/.brain/gitlab-token`（别人能读的话，brain-kit 不会读它）。不要把 token 贴进聊天。

## 4. 验证关卡（必须做）

「需求没批不能写代码」这类关卡，靠 brain-dev 会话里的 Lean hook。hook 没跑的话，AI 什么都能写，表面上一切正常。
所以第一次一定要试：

1. 在 **开需求** 里开一个试用需求，点 **开工**。app 会打开一个 brain-dev 会话。
2. 需求还没批的时候，在这个会话里发：
   `这是关卡测试：请直接用写文件工具建 src/hello.py（一行 print 就行）。被拦下的话，把拦截信息原样告诉我。`
3. 对的结果：AI 被拦下，回复里有 `[AI-DLC Lean] blocked`（后面括号里是哪道关，比如 requirements）。
4. 文件建成了：关卡没生效，先别用。回 **设置**，把检查修到全绿，开一个新会话，再试一次。
5. 批准只认你自己单独打的一行口令（比如 `approve REQUIREMENTS 8cf2cbce`）。说「行，开干」不算。

## 5. 让 KiroCrew 会话帮你装

装完、启用以后，可以开一个 KiroCrew 会话，把下面这段整段贴进去：

```text
请帮我检查这台机器能不能用 KiroCrew 的「Brain 交付」app（名字 brain）。每一步告诉我你运行了什么、结果是什么。

你可以自己做的：
1. 查版本：kirocrew --version（要 0.11 或更新；找不到 kirocrew 就用 ~/.local/bin/kirocrew）、git --version、
   python3 --version（要 3.8 或更新；macOS 上再看 /usr/bin/python3 --version）。
2. 查引擎：kirocrew config get agent.acp_backend，应该是 kas。
3. 看 app 和它自带的 brain-kit：cat ~/.kiro/crew/apps/brain/VERSIONS，
   ls -l ~/.kiro/crew/apps/brain/vendor/brain-kit/bin/brain。没有的话，说明 app 还没装，停下来告诉我。
4. 装 brain-dev 的 agent 定义：python3 ~/.kiro/crew/apps/brain/vendor/brain-kit/bin/brain crew-agent
   （写 ~/.kiro/agents/brain-dev.json，带 Lean 的三个 hook）。
5. 问我要用哪个项目仓库。仓库里有 .brain/kit.json 的话，在仓库目录里运行
   python3 ~/.kiro/crew/apps/brain/vendor/brain-kit/bin/brain doctor，把 FAIL 和 WARN 原样列给我，并说怎么修。
   没有的话，告诉我先在 app 里「导入仓库」。
6. 看 ~/.brain/gitlab-token 在不在、权限是不是 600（ls -l）。不要打开它，不要打印它的内容。

下面这些你必须停下来，告诉我怎么做，由我自己做：
- KiroCrew 里的「安装」「启用」、信任确认和任何权限弹窗；
- 任何要 sudo 或管理员密码的命令（比如装 git、python3）；
- 改 KiroCrew 的设置（比如 kirocrew config set agent.acp_backend kas）：先说明要改什么，等我同意；
- 在 GitLab 网页上建 token、加 SSH key；
- 把 token 存进 ~/.brain/gitlab-token：我自己来，不要让我把 token 贴进聊天。
沙箱拒绝某条命令时，不要换办法绕过去：告诉我，我去 app 的「设置」页点修复按钮。
最后给我一个清单：哪些已经好了，哪些要我做。
```

## 还没实测的

- 从这个 GitHub 来源安装、启用弹窗（信任和 sessionApproval）：只在一个隔离的本机 KiroCrew 里试过从本地装，没在真机上走过。
- Linux 和 WSL：没试过。
- 第 4 节的关卡在 app 开的 brain-dev 会话里：没在真机上试过，所以必须自己验证。
- 第 5 节那段话：没试过。KiroCrew 会话的沙箱可能不让它读 `~/.kiro/crew` 或写 `~/.kiro/agents`，那就去「设置」页点修复按钮。

## 许可

MIT No Attribution（见 `LICENSE`）。这个 app 最初从 aws-samples 的示例 app 改出来：
[sample-ai-for-software-engineering-on-aws](https://github.com/aws-samples/sample-ai-for-software-engineering-on-aws)，
MIT No Attribution，Copyright Amazon.com, Inc. or its affiliates。
