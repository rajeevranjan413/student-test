"use client";

import { useEffect, useState } from "react";
import {
  App,
  Button,
  Card,
  Divider,
  Empty,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  Upload,
} from "antd";
import type { UploadFile } from "antd";
import {
  DeleteOutlined,
  KeyOutlined,
  PictureOutlined,
  PlusOutlined,
  SaveOutlined,
} from "@ant-design/icons";
import { PageContainer } from "@/components/layout/PageContainer";
import { uploadFilesDirect } from "@/utils/uploadClient";

const { Title, Text, Paragraph } = Typography;

/**
 * Admin application settings (F17). Two cards to start — the multi-batch
 * registration code and the student home banner slides — with room for more later.
 * Teacher-only; the API (`/api/admin/settings`) re-enforces that server-side.
 */

// A banner already saved on the server (has an R2 key + a signed preview URL).
type SavedBanner = { key: string; alt: string; url: string | null };
// A banner picked in the browser but not yet uploaded/saved.
type PendingBanner = { uid: string; file: File; alt: string; preview: string };

export default function AdminSettingsPage() {
  const { message } = App.useApp();

  const [loading, setLoading] = useState(true);
  const [maxBanners, setMaxBanners] = useState(8);

  // Registration code
  const [secret, setSecret] = useState("");
  const [secretSource, setSecretSource] = useState<"db" | "env" | "none">("none");
  const [savingSecret, setSavingSecret] = useState(false);

  // Banners
  const [saved, setSaved] = useState<SavedBanner[]>([]);
  const [pending, setPending] = useState<PendingBanner[]>([]);
  const [savingBanners, setSavingBanners] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load settings.");
        setSecret(data.registrationSecret ?? "");
        setSecretSource(data.registrationSecretSource ?? "none");
        setSaved(Array.isArray(data.banners) ? data.banners : []);
        if (typeof data.maxBanners === "number") setMaxBanners(data.maxBanners);
      } catch (e) {
        message.error(e instanceof Error ? e.message : "Failed to load settings.");
      } finally {
        setLoading(false);
      }
    })();
    // message is stable from App.useApp; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveSecret = async () => {
    setSavingSecret(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ registrationSecret: secret }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save.");
      setSecretSource(secret.trim() ? "db" : "env");
      message.success("Registration code saved.");
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSavingSecret(false);
    }
  };

  const totalBanners = saved.length + pending.length;

  const addPending = (file: File) => {
    setPending((prev) => [
      ...prev,
      {
        uid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        alt: "",
        preview: URL.createObjectURL(file),
      },
    ]);
  };

  const saveBanners = async () => {
    setSavingBanners(true);
    try {
      let uploadedKeys: { key: string }[] = [];
      if (pending.length > 0) {
        const result = await uploadFilesDirect(
          "banner",
          {},
          pending.map((p) => p.file)
        );
        uploadedKeys = result.map((r) => ({ key: r.key }));
      }

      const banners = [
        ...saved.map((b) => ({ key: b.key, alt: b.alt })),
        ...pending.map((p, i) => ({ key: uploadedKeys[i].key, alt: p.alt })),
      ];

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ banners }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save banners.");

      message.success("Student banners saved.");
      // Revoke the object URLs and reload fresh signed previews.
      pending.forEach((p) => URL.revokeObjectURL(p.preview));
      setPending([]);
      const reload = await fetch("/api/admin/settings");
      const fresh = await reload.json().catch(() => ({}));
      if (reload.ok) setSaved(Array.isArray(fresh.banners) ? fresh.banners : []);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Failed to save banners.");
    } finally {
      setSavingBanners(false);
    }
  };

  const thumbStyle: React.CSSProperties = {
    width: 96,
    height: 56,
    objectFit: "cover",
    borderRadius: 8,
    background: "rgba(0,0,0,0.04)",
    flex: "0 0 auto",
  };

  if (loading) {
    return (
      <PageContainer max={840}>
        <Flexed>
          <Spin />
        </Flexed>
      </PageContainer>
    );
  }

  return (
    <PageContainer max={840}>
      <Title level={3} style={{ marginTop: 0 }}>
        Settings
      </Title>
      <Text type="secondary">Application settings for your coaching center.</Text>

      {/* Registration code -------------------------------------------------- */}
      <Card
        style={{ marginTop: 20 }}
        title={
          <Space>
            <KeyOutlined />
            Multi-batch registration code
          </Space>
        }
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          Students who register for <b>more than one batch</b> at once must enter this
          code. A student picking a single batch uses that batch&apos;s own enrollment
          code instead. Leave blank to fall back to the <code>REGISTRATION_SECRET_PASS</code>{" "}
          environment variable (and to disable multi-batch signup if that is also unset).
        </Paragraph>
        <div style={{ marginBottom: 8 }}>
          {secretSource === "db" && <Tag color="blue">Currently set here (database)</Tag>}
          {secretSource === "env" && <Tag color="gold">Currently using the env fallback</Tag>}
          {secretSource === "none" && <Tag>Not set — multi-batch signup disabled</Tag>}
        </div>
        <Space.Compact style={{ width: "100%", maxWidth: 460 }}>
          <Input.Password
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="Enter a center-wide registration code"
            visibilityToggle
          />
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={savingSecret}
            onClick={saveSecret}
          >
            Save
          </Button>
        </Space.Compact>
      </Card>

      {/* Student banners ---------------------------------------------------- */}
      <Card
        style={{ marginTop: 20 }}
        title={
          <Space>
            <PictureOutlined />
            Student home banners
          </Space>
        }
        extra={
          <Text type="secondary">
            {totalBanners}/{maxBanners}
          </Text>
        }
      >
        <Paragraph type="secondary" style={{ marginTop: 0 }}>
          The image slides on the student home screen. When none are set, the app shows
          its bundled default photos. Recommended ratio ~ 1200 × 420.
        </Paragraph>

        {saved.length === 0 && pending.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="No custom banners — students see the bundled defaults."
          />
        )}

        <Space direction="vertical" size={12} style={{ width: "100%" }}>
          {saved.map((b, idx) => (
            <div key={b.key} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={b.url ?? undefined} alt={b.alt} style={thumbStyle} />
              <Input
                value={b.alt}
                placeholder="Describe this image (alt text)"
                onChange={(e) =>
                  setSaved((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, alt: e.target.value } : x))
                  )
                }
              />
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                aria-label="Remove banner"
                onClick={() => setSaved((prev) => prev.filter((_, i) => i !== idx))}
              />
            </div>
          ))}

          {pending.map((p, idx) => (
            <div key={p.uid} style={{ display: "flex", gap: 12, alignItems: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt={p.alt} style={thumbStyle} />
              <Input
                value={p.alt}
                placeholder="Describe this image (alt text)"
                onChange={(e) =>
                  setPending((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, alt: e.target.value } : x))
                  )
                }
                suffix={<Tag color="green">new</Tag>}
              />
              <Button
                danger
                type="text"
                icon={<DeleteOutlined />}
                aria-label="Remove banner"
                onClick={() => {
                  URL.revokeObjectURL(p.preview);
                  setPending((prev) => prev.filter((_, i) => i !== idx));
                }}
              />
            </div>
          ))}
        </Space>

        <Divider style={{ margin: "16px 0" }} />

        <Space wrap>
          <Upload
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            showUploadList={false}
            beforeUpload={(file) => {
              if (totalBanners >= maxBanners) {
                message.warning(`You can add up to ${maxBanners} banners.`);
                return Upload.LIST_IGNORE;
              }
              addPending(file as unknown as File);
              return false; // prevent antd's auto-upload; we upload on Save
            }}
            fileList={[] as UploadFile[]}
          >
            <Button icon={<PlusOutlined />} disabled={totalBanners >= maxBanners}>
              Add images
            </Button>
          </Upload>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={savingBanners}
            onClick={saveBanners}
          >
            Save banners
          </Button>
        </Space>
      </Card>
    </PageContainer>
  );
}

/** Small centered wrapper for the loading spinner. */
function Flexed({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      {children}
    </div>
  );
}
