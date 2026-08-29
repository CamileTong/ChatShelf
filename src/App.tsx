import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ErrorInfo,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useParams,
} from "react-router-dom";
import { useLiveQuery } from "dexie-react-hooks";
import { useRegisterSW } from "virtual:pwa-register/react";
import {
  ArrowLeft,
  BookOpen,
  Check,
  Download,
  Edit3,
  ImagePlus,
  MessageCircleMore,
  MoreHorizontal,
  Palette,
  Pin,
  PinOff,
  Plus,
  Send,
  Settings,
  Share2,
  Trash2,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import {
  createChannel,
  createMessage,
  db,
  deleteChannel,
  deleteMessage,
  dispatchMessages,
  editMessage,
  getPreference,
  imageFileToAvatar,
  isPersistentStorage,
  normalizeAlias,
  requestPersistentStorage,
  setChannelPinned,
  setPreference,
  sortChannels,
  updateChannel,
  type Channel,
  type Message,
  type Profile,
  type ThemeMode,
} from "./db";
import { parseChatInput, parseConsoleInput } from "./commands";
import {
  createBackup,
  createReadableExport,
  importBackup,
  readBackupFile,
  shareBackup,
  shareReadableExport,
} from "./backup";
import { formatSmartDate } from "./date";

const palettes = [
  { id: "plum", label: "Plum", colors: ["#8366c8", "#dfd1f8"] },
  { id: "ocean", label: "Ocean", colors: ["#2a8fc9", "#ccdef1"] },
  { id: "forest", label: "Forest", colors: ["#32691a", "#d4ee8d"] },
  { id: "sunset", label: "Sunset", colors: ["#a32e1c", "#e7cec9"] },
];
const EMPTY_CHANNELS: Channel[] = [];
const DEFAULT_SELF_PROFILE: Profile = { name: "Me" };

function Avatar({
  profile,
  size = "medium",
}: {
  profile: Profile;
  size?: "small" | "medium" | "large";
}) {
  return profile.avatar ? (
    <img className={`avatar avatar-${size}`} src={profile.avatar} alt="" />
  ) : (
    <span className={`avatar avatar-${size} avatar-fallback`}>
      {profile.name.trim().slice(0, 1).toUpperCase() || "?"}
    </span>
  );
}

function IconButton({
  label,
  children,
  ...props
}: {
  label: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className="icon-button" aria-label={label} title={label} {...props}>
      {children}
    </button>
  );
}

function PageHeader({
  title,
  subtitle,
  back,
  action,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div className="header-leading">
        {back && (
          <IconButton label="Go back" onClick={() => navigate(-1)}>
            <ArrowLeft />
          </IconButton>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      <NavLink to="/" end>
        <MessageCircleMore />
        <span>Chats</span>
      </NavLink>
      <NavLink to="/console">
        <Send />
        <span>Console</span>
      </NavLink>
      <NavLink to="/settings">
        <Settings />
        <span>Settings</span>
      </NavLink>
    </nav>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <main>{children}</main>
      <BottomNav />
    </div>
  );
}

function ChannelForm({
  channel,
  defaultSelfProfile = DEFAULT_SELF_PROFILE,
  onClose,
}: {
  channel?: Channel;
  defaultSelfProfile?: Profile;
  onClose: () => void;
}) {
  const [name, setName] = useState(channel?.name ?? "");
  const [alias, setAlias] = useState(channel?.alias ?? "");
  const [selfProfile, setSelfProfile] = useState<Profile>(
    channel?.selfProfile ?? defaultSelfProfile,
  );
  const [otherProfile, setOtherProfile] = useState<Profile>(
    channel?.otherProfile ?? { name: "Coach" },
  );
  const [error, setError] = useState("");

  async function chooseAvatar(file: File | undefined, side: "self" | "other") {
    if (!file) return;
    const avatar = await imageFileToAvatar(file);
    if (side === "self") setSelfProfile((profile) => ({ ...profile, avatar }));
    else setOtherProfile((profile) => ({ ...profile, avatar }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const normalized = normalizeAlias(alias || name);
    if (!name.trim() || !normalized)
      return setError("Name and command alias are required.");
    if (!/^[a-z0-9_-]+$/.test(normalized))
      return setError("Alias can only use letters, numbers, - and _.");
    const existing = await db.channels
      .where("alias")
      .equals(normalized)
      .first();
    if (existing && existing.id !== channel?.id)
      return setError(`/${normalized} is already in use.`);
    try {
      const values = {
        name: name.trim(),
        alias: normalized,
        selfProfile,
        otherProfile,
      };
      if (channel) await updateChannel(channel.id, values);
      else await createChannel(values);
      onClose();
    } catch {
      setError("Could not save this chat.");
    }
  }

  const profileEditor = (
    label: string,
    profile: Profile,
    side: "self" | "other",
    setter: (profile: Profile) => void,
  ) => (
    <fieldset className="profile-editor">
      <legend>{label}</legend>
      <label className="avatar-picker">
        <Avatar profile={profile} size="large" />
        <span>
          <ImagePlus size={16} /> Photo
        </span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => void chooseAvatar(e.target.files?.[0], side)}
        />
      </label>
      <label>
        Name
        <input
          value={profile.name}
          onChange={(e) => setter({ ...profile, name: e.target.value })}
          required
        />
      </label>
    </fieldset>
  );

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-form-title"
      >
        <div className="sheet-header">
          <h2 id="channel-form-title">{channel ? "Edit chat" : "New chat"}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Chat name
            <input
              autoFocus
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!alias) setAlias(normalizeAlias(e.target.value));
              }}
              placeholder="Fitness"
            />
          </label>
          <label>
            Console command
            <div className="input-prefix">
              <span>/</span>
              <input
                value={alias}
                onChange={(e) => setAlias(normalizeAlias(e.target.value))}
                placeholder="fitness"
              />
            </div>
          </label>
          <div className="profile-grid">
            {profileEditor("My side", selfProfile, "self", setSelfProfile)}
            {profileEditor(
              "Other side",
              otherProfile,
              "other",
              setOtherProfile,
            )}
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" type="submit">
            {channel ? "Save changes" : "Create chat"}
          </button>
        </form>
      </section>
    </div>
  );
}

function ChannelsPage() {
  const channels =
    useLiveQuery(
      async () => sortChannels(await db.channels.toArray()),
      [],
    ) ?? [];
  const defaultSelfProfile = useLiveQuery(
    () => getPreference<Profile>("defaultSelfProfile", DEFAULT_SELF_PROFILE),
    [],
  );
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const [actionsChannel, setActionsChannel] = useState<Channel | null>(null);

  return (
    <Shell>
      <PageHeader
        title="万华镜"
        subtitle="A quiet place for your thoughts"
        action={
          <IconButton label="New chat" onClick={() => setEditing("new")}>
            <Plus />
          </IconButton>
        }
      />
      <section className="page-content">
        {channels.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">
              <BookOpen />
            </span>
            <h2>Start your first shelf</h2>
            <p>
              Create a chat for fitness, reading, ideas, or anything you want to
              remember.
            </p>
            <button className="primary" onClick={() => setEditing("new")}>
              <Plus /> Create a chat
            </button>
          </div>
        ) : (
          <div className="channel-list">
            {channels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                onEdit={() => setEditing(channel)}
                onLongPress={() => setActionsChannel(channel)}
              />
            ))}
          </div>
        )}
      </section>
      {editing && (
        <ChannelForm
          channel={editing === "new" ? undefined : editing}
          defaultSelfProfile={defaultSelfProfile}
          onClose={() => setEditing(null)}
        />
      )}
      {actionsChannel && (
        <ChannelActions
          channel={actionsChannel}
          onClose={() => setActionsChannel(null)}
        />
      )}
    </Shell>
  );
}

function ChannelActions({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  async function togglePin() {
    await setChannelPinned(channel.id, !channel.pinnedAt);
    onClose();
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="sheet action-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-actions-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-header">
          <h2 id="channel-actions-title">{channel.name}</h2>
          <IconButton label="Close" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <button className="action-row" onClick={() => void togglePin()}>
          {channel.pinnedAt ? <PinOff /> : <Pin />}
          {channel.pinnedAt ? "Unpin chat" : "Pin chat"}
        </button>
      </section>
    </div>
  );
}

function ChannelRow({
  channel,
  onEdit,
  onLongPress,
}: {
  channel: Channel;
  onEdit: () => void;
  onLongPress: () => void;
}) {
  const navigate = useNavigate();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClick = useRef(false);
  const lastMessage = useLiveQuery(
    async () =>
      (
        await db.messages
          .where("channelId")
          .equals(channel.id)
          .sortBy("createdAt")
      ).at(-1),
    [channel.id],
  );

  function startLongPress(event: ReactPointerEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest("button")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    longPressTimer.current = setTimeout(() => {
      suppressClick.current = true;
      onLongPress();
    }, 550);
  }

  function clearLongPress() {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = null;
  }

  return (
    <article
      className="channel-row"
      role="link"
      tabIndex={0}
      onPointerDown={startLongPress}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
      onPointerLeave={clearLongPress}
      onClick={(event) => {
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          return;
        }
        navigate(`/chat/${channel.id}`);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") navigate(`/chat/${channel.id}`);
      }}
    >
      <Avatar profile={channel.otherProfile} size="large" />
      <div className="channel-copy">
        <div>
          <h2>
            {channel.pinnedAt && (
              <span className="pin-indicator" aria-label="Pinned">
                📌
              </span>
            )}
            {channel.name}
          </h2>
          <time>
            {lastMessage ? formatListTime(lastMessage.createdAt) : ""}
          </time>
        </div>
        <p>{lastMessage?.content ?? `Send with /${channel.alias}`}</p>
      </div>
      <IconButton
        label={`Edit ${channel.name}`}
        onClick={(event) => {
          event.stopPropagation();
          onEdit();
        }}
      >
        <MoreHorizontal />
      </IconButton>
    </article>
  );
}

function formatListTime(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
      }).format(date)
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
      }).format(date);
}

function ChatPage() {
  const { channelId = "" } = useParams();
  const navigate = useNavigate();
  const channel = useLiveQuery(() => db.channels.get(channelId), [channelId]);
  const messages =
    useLiveQuery(
      () =>
        db.messages.where("channelId").equals(channelId).sortBy("createdAt"),
      [channelId],
    ) ?? [];
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => endRef.current?.scrollIntoView({ block: "end" }),
    [messages.length],
  );
  if (channel === undefined)
    return <div className="center-screen">Loading…</div>;
  if (!channel)
    return (
      <div className="center-screen">
        <p>Chat not found.</p>
        <button onClick={() => navigate("/")}>Go home</button>
      </div>
    );

  async function send(event: FormEvent) {
    event.preventDefault();
    const parsed = parseChatInput(text);
    if (!parsed.content) return;
    await createMessage(channel!.id, parsed.content, parsed.side);
    setText("");
  }

  async function removeChat() {
    if (!confirm(`Delete “${channel!.name}” and all of its messages?`)) return;
    await deleteChannel(channel!.id);
    navigate("/");
  }

  return (
    <div className="chat-page">
      <PageHeader
        back
        title={channel.name}
        subtitle={`/${channel.alias}`}
        action={
          <IconButton
            label="Chat options"
            onClick={() => setShowMenu((value) => !value)}
          >
            <MoreHorizontal />
          </IconButton>
        }
      />
      {showMenu && (
        <div className="popover header-popover">
          <button
            onClick={() => {
              setShowEdit(true);
              setShowMenu(false);
            }}
          >
            <Edit3 /> Edit chat
          </button>
          <button className="danger" onClick={() => void removeChat()}>
            <Trash2 /> Delete chat
          </button>
        </div>
      )}
      <div className="message-list">
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>No messages yet.</p>
            <span>
              Tip: start with <strong>/c</strong> to send from the other side.
            </span>
          </div>
        )}
        {messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            channel={channel}
            showDate={
              index === 0 ||
              new Date(messages[index - 1].createdAt).toDateString() !==
                new Date(message.createdAt).toDateString()
            }
          />
        ))}
        <div ref={endRef} />
      </div>
      <form className="composer" onSubmit={(event) => void send(event)}>
        <textarea
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message yourself…  /c for other side"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />
        <button
          className="send-button"
          aria-label="Send"
          disabled={!text.trim()}
        >
          <Send />
        </button>
      </form>
      {showEdit && (
        <ChannelForm channel={channel} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}

function MessageBubble({
  message,
  channel,
  showDate,
}: {
  message: Message;
  channel: Channel;
  showDate: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const profile =
    message.side === "self" ? channel.selfProfile : channel.otherProfile;
  async function edit() {
    setMenu(false);
    const next = prompt("Edit message", message.content);
    if (next?.trim() && next.trim() !== message.content)
      await editMessage(message.id, next);
  }
  async function remove() {
    setMenu(false);
    if (confirm("Delete this message?")) await deleteMessage(message.id);
  }
  return (
    <>
      {showDate && (
        <div className="date-divider">
          <span>{formatSmartDate(message.createdAt)}</span>
        </div>
      )}
      <article className={`message-row ${message.side}`}>
        {message.side === "other" && <Avatar profile={profile} size="small" />}
        <div className="message-wrap">
          <button className="bubble" onClick={() => setMenu((value) => !value)}>
            <span>{message.content}</span>
            <small>
              {new Intl.DateTimeFormat(undefined, {
                hour: "numeric",
                minute: "2-digit",
              }).format(new Date(message.createdAt))}
              {message.updatedAt && " · edited"}
            </small>
          </button>
          {menu && (
            <div className="popover message-popover">
              <button onClick={() => void edit()}>
                <Edit3 /> Edit
              </button>
              <button className="danger" onClick={() => void remove()}>
                <Trash2 /> Delete
              </button>
            </div>
          )}
        </div>
        {message.side === "self" && <Avatar profile={profile} size="small" />}
      </article>
    </>
  );
}

function ConsolePage() {
  const channels =
    useLiveQuery(() => db.channels.toArray(), []) ?? EMPTY_CHANNELS;
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const parsed = useMemo(
    () => parseConsoleInput(text, channels),
    [text, channels],
  );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (parsed.error) return setError(parsed.error);
    await dispatchMessages(parsed.channelIds, parsed.content, parsed.side);
    setText("");
    setError("");
    setSent(true);
    setTimeout(() => setSent(false), 1800);
  }

  return (
    <Shell>
      <PageHeader title="Console" subtitle="One message, many shelves" />
      <section className="page-content console-page">
        <div className="console-card">
          <form onSubmit={(event) => void submit(event)}>
            <textarea
              autoFocus
              rows={6}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setError("");
              }}
              placeholder="/fitness /boxing Today I trained for 45 minutes."
            />
            {text && parsed.aliases.length > 0 && (
              <div className="target-preview">
                <span>To</span>
                {parsed.aliases.map((alias) => (
                  <span className="chip" key={alias}>
                    /{alias}
                  </span>
                ))}
                {parsed.side === "other" && (
                  <span className="chip other-chip">Other side</span>
                )}
              </div>
            )}
            {(error || (text && parsed.error)) && (
              <p className="form-error">{error || parsed.error}</p>
            )}
            <button className="primary full" disabled={!text.trim()}>
              {sent ? (
                <>
                  <Check /> Sent
                </>
              ) : (
                <>
                  <Share2 /> Send to chats
                </>
              )}
            </button>
          </form>
        </div>
        <div className="help-card">
          <h2>How it works</h2>
          <p>
            <code>/fitness /reading Your message</code>
          </p>
          <p>
            Add <code>/c</code> before the message to send from the other side.
          </p>
          <p>
            Console inputs are never saved. Only messages in the selected chats
            are stored.
          </p>
        </div>
        {channels.length === 0 && (
          <p className="notice">Create a chat before using Console.</p>
        )}
      </section>
    </Shell>
  );
}

function SettingsPage() {
  const channels =
    useLiveQuery(
      async () =>
        (await db.channels.toArray()).sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      [],
    ) ?? EMPTY_CHANNELS;
  const [palette, setPalette] = useState(
    document.documentElement.dataset.palette ?? "plum",
  );
  const [mode, setMode] = useState<ThemeMode>(
    (document.documentElement.dataset.mode as ThemeMode) ?? "system",
  );
  const [channelId, setChannelId] = useState("");
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [status, setStatus] = useState("");
  const [defaultProfile, setDefaultProfile] = useState<Profile>(
    DEFAULT_SELF_PROFILE,
  );
  const [profileStatus, setProfileStatus] = useState("");
  const [storageState, setStorageState] = useState<
    "checking" | "protected" | "not-guaranteed" | "unsupported"
  >("checking");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void getPreference<Profile>(
      "defaultSelfProfile",
      DEFAULT_SELF_PROFILE,
    ).then(setDefaultProfile);
    void requestPersistentStorage()
      .then(() => isPersistentStorage())
      .then((isPersistent) => {
        setStorageState(
          isPersistent === null
            ? "unsupported"
            : isPersistent
              ? "protected"
              : "not-guaranteed",
        );
      });
  }, []);

  async function choosePalette(value: string) {
    setPalette(value);
    document.documentElement.dataset.palette = value;
    await setPreference("palette", value);
  }
  async function chooseMode(value: ThemeMode) {
    setMode(value);
    document.documentElement.dataset.mode = value;
    await setPreference("mode", value);
  }
  async function exportData() {
    try {
      await shareBackup(
        await createBackup({
          channelId: channelId || undefined,
          fromMonth: channelId ? fromMonth || undefined : undefined,
          toMonth: channelId ? toMonth || undefined : undefined,
        }),
      );
      await setPreference("lastExportAt", new Date().toISOString());
      setStatus("Backup ready.");
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        setStatus("Could not create the backup.");
    }
  }
  async function exportReadable() {
    try {
      await shareReadableExport(
        await createReadableExport({
          channelId: channelId || undefined,
          fromMonth: channelId ? fromMonth || undefined : undefined,
          toMonth: channelId ? toMonth || undefined : undefined,
        }),
      );
      setStatus("Readable export ready.");
    } catch (error) {
      if ((error as Error).name !== "AbortError")
        setStatus("Could not create the readable export.");
    }
  }
  async function chooseDefaultAvatar(file: File | undefined) {
    if (!file) return;
    const avatar = await imageFileToAvatar(file);
    setDefaultProfile((profile) => ({ ...profile, avatar }));
    setProfileStatus("");
  }
  async function saveDefaultProfile() {
    if (!defaultProfile.name.trim()) {
      setProfileStatus("A name is required.");
      return;
    }
    const profile = { ...defaultProfile, name: defaultProfile.name.trim() };
    await setPreference("defaultSelfProfile", profile);
    setDefaultProfile(profile);
    setProfileStatus("Default saved. Existing chats were not changed.");
  }
  async function restore(file: File | undefined) {
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const replace = confirm(
        "Press OK to replace all current data. Press Cancel to merge this backup instead.",
      );
      if (
        replace &&
        !confirm("This will erase current data before restoring. Continue?")
      )
        return;
      await importBackup(backup, replace ? "replace" : "merge");
      setStatus(`Restored ${backup.messages.length} messages.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Shell>
      <PageHeader title="Settings" subtitle="Make ChatShelf yours" />
      <section className="page-content settings-page">
        <SettingsSection icon={<Palette />} title="Appearance">
          <div className="segmented">
            {(["system", "light", "dark"] as ThemeMode[]).map((value) => (
              <button
                className={mode === value ? "selected" : ""}
                key={value}
                onClick={() => void chooseMode(value)}
              >
                {value[0].toUpperCase() + value.slice(1)}
              </button>
            ))}
          </div>
          <div className="palette-grid">
            {palettes.map((item) => (
              <button
                className={`palette-option ${palette === item.id ? "selected" : ""}`}
                key={item.id}
                onClick={() => void choosePalette(item.id)}
              >
                <span className="swatches">
                  {item.colors.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                <span>{item.label}</span>
                {palette === item.id && <Check />}
              </button>
            ))}
          </div>
        </SettingsSection>
        <SettingsSection icon={<UserRound />} title="Default My Side">
          <p className="section-note">
            Used when creating new chats. Existing chats will not be changed.
          </p>
          <div className="default-profile-editor">
            <label className="avatar-picker">
              <Avatar profile={defaultProfile} size="large" />
              <span>
                <ImagePlus size={16} /> Change photo
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  void chooseDefaultAvatar(event.target.files?.[0])
                }
              />
            </label>
            <label>
              Name
              <input
                value={defaultProfile.name}
                onChange={(event) => {
                  setDefaultProfile((profile) => ({
                    ...profile,
                    name: event.target.value,
                  }));
                  setProfileStatus("");
                }}
              />
            </label>
          </div>
          {defaultProfile.avatar && (
            <button
              className="text-button danger"
              onClick={() => {
                setDefaultProfile(({ name }) => ({ name }));
                setProfileStatus("");
              }}
            >
              Remove default photo
            </button>
          )}
          <button
            className="secondary full"
            onClick={() => void saveDefaultProfile()}
          >
            <Check /> Save default
          </button>
          {profileStatus && (
            <p className="status-message">{profileStatus}</p>
          )}
        </SettingsSection>
        <SettingsSection icon={<Download />} title="Backup & export">
          <p className="section-note">
            Export everything, or choose one chat and an optional month range.
          </p>
          <label>
            Chat
            <select
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="">All chats</option>
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  {channel.name}
                </option>
              ))}
            </select>
          </label>
          {channelId && (
            <div className="month-grid">
              <label>
                From month
                <input
                  type="month"
                  value={fromMonth}
                  onChange={(e) => setFromMonth(e.target.value)}
                />
              </label>
              <label>
                To month
                <input
                  type="month"
                  value={toMonth}
                  min={fromMonth}
                  onChange={(e) => setToMonth(e.target.value)}
                />
              </label>
            </div>
          )}
          <button className="primary full" onClick={() => void exportData()}>
            <Download /> Export JSON
          </button>
          <button
            className="secondary full"
            onClick={() => void exportReadable()}
          >
            <Share2 /> Export Readable
          </button>
          <button
            className="secondary full"
            onClick={() => fileRef.current?.click()}
          >
            <Upload /> Restore JSON
          </button>
          <input
            ref={fileRef}
            hidden
            type="file"
            accept="application/json,.json"
            onChange={(e) => void restore(e.target.files?.[0])}
          />
          {status && <p className="status-message">{status}</p>}
        </SettingsSection>
        <SettingsSection icon={<Settings />} title="Storage">
          <div className="storage-warning">
            <strong>Stored only on this device</strong>
            <p>
              Clearing browser data can erase your journal. Export backups
              regularly.
            </p>
          </div>
          <div className="storage-status-row">
            <span className={`storage-dot ${storageState}`} />
            <div>
              <strong>Storage protection</strong>
              <p>
                {storageState === "checking" && "Checking browser status…"}
                {storageState === "protected" &&
                  "Protected from automatic browser eviction."}
                {storageState === "not-guaranteed" &&
                  "The browser does not guarantee protection."}
                {storageState === "unsupported" &&
                  "Status is unavailable in this browser."}
              </p>
            </div>
          </div>
        </SettingsSection>
        <p className="app-version">ChatShelf · Private by design · v1</p>
      </section>
    </Shell>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-card">
      <div className="settings-title">
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function ThemeBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    Promise.all([
      getPreference("palette", "plum"),
      getPreference<ThemeMode>("mode", "system"),
    ]).then(([palette, mode]) => {
      document.documentElement.dataset.palette = palette;
      document.documentElement.dataset.mode = mode;
      setReady(true);
    });
    void requestPersistentStorage();
  }, []);
  return ready ? children : <div className="center-screen">ChatShelf</div>;
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div className="update-toast" role="status">
      <span>A new version is ready.</span>
      <button onClick={() => void updateServiceWorker(true)}>Update</button>
      <IconButton label="Dismiss update" onClick={() => setNeedRefresh(false)}>
        <X />
      </IconButton>
    </div>
  );
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ChatShelf render error", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="center-screen">
          <div>
            <h1>Something went wrong</h1>
            <p>{this.state.error.message}</p>
            <button className="primary" onClick={() => location.reload()}>
              Reload ChatShelf
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeBootstrap>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<ChannelsPage />} />
            <Route path="/chat/:channelId" element={<ChatPage />} />
            <Route path="/console" element={<ConsolePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
          <UpdatePrompt />
        </BrowserRouter>
      </ThemeBootstrap>
    </AppErrorBoundary>
  );
}
