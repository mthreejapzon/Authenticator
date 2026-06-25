/**
 * health.tsx — Password Health Dashboard
 *
 * Reachable from Settings → "Password Health" row.
 * Scans all stored accounts, decrypts passwords (requires GitHub PAT),
 * and presents a scored report of weak, reused, old, and breached passwords.
 *
 * Breach check uses the HIBP k-Anonymity API — your passwords are never
 * sent over the network (only the first 5 chars of their SHA-1 hash).
 */

import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./context/ThemeContext";
import { decryptText } from "./utils/crypto";
import { Storage } from "./utils/storage";
import { GITHUB_PAT_KEY, USER_ACCOUNT_KEYS } from "./utils/constants";
import {
  OLD_PASSWORD_DAYS_THRESHOLD,
  type AccountSnapshot,
  type HealthIssue,
  type HealthReport,
  analyseHealth,
} from "./utils/passwordHealth";
import { checkPasswordBreachesBatch } from "./utils/breachCheck";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#16a34a";
  if (score >= 55) return "#d97706";
  return "#e7000b";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Great";
  if (score >= 55) return "Fair";
  return "At Risk";
}

function formatDays(days: number): string {
  if (days < 60)  return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}yr ago`;
}

function formatBreachCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M leaks`;
  if (count >= 1_000)     return `${(count / 1_000).toFixed(0)}K leaks`;
  return `${count} leaks`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const color = scoreColor(score);
  const label = scoreLabel(score);
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 8, borderColor: "#e5e7eb" }} />
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: 8, borderColor: color, opacity: 0.25 }} />
      <Text style={{ fontSize: 32, fontWeight: "800", color }}>{score}</Text>
      <Text style={{ fontSize: 12, fontWeight: "700", color, marginTop: -2 }}>{label}</Text>
    </View>
  );
}

function StatCard({
  icon, count, label, color, bg,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  count: number;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: bg, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 10, alignItems: "center", gap: 4 }}>
      <Ionicons name={icon} size={20} color={color} />
      <Text style={{ fontSize: 22, fontWeight: "800", color }}>{count}</Text>
      <Text style={{ fontSize: 11, fontWeight: "600", color, textAlign: "center" }}>{label}</Text>
    </View>
  );
}

function IssueRow({
  issue, colors, onPress,
}: {
  issue: HealthIssue;
  colors: ReturnType<typeof useTheme>["colors"];
  onPress: () => void;
}) {
  const pills: { label: string; bg: string; text: string }[] = [];
  if (issue.issues.includes("breached")) pills.push({ label: "Breached ☠️", bg: colors.dangerBg,  text: colors.danger });
  if (issue.issues.includes("weak"))     pills.push({ label: "Weak",        bg: colors.dangerBg,  text: colors.danger });
  if (issue.issues.includes("reused"))   pills.push({ label: "Reused",      bg: colors.warningBg, text: colors.warning });
  if (issue.issues.includes("old"))      pills.push({ label: "Old",         bg: colors.infoBg,    text: colors.otpPrimary });

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 13,
        paddingHorizontal: 16,
        backgroundColor: colors.card,
        borderRadius: 12,
        marginBottom: 8,
        gap: 12,
        borderLeftWidth: issue.issues.includes("breached") ? 3 : 0,
        borderLeftColor: colors.danger,
      }}
    >
      {/* Initial bubble */}
      <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontSize: 15, fontWeight: "700", color: colors.text }}>
          {(issue.accountName || "?")[0].toUpperCase()}
        </Text>
      </View>

      {/* Name + pills */}
      <View style={{ flex: 1, gap: 5 }}>
        <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }} numberOfLines={1}>
          {issue.accountName}
        </Text>
        {issue.username ? (
          <Text style={{ fontSize: 12, color: colors.subText }} numberOfLines={1}>
            {issue.username}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          {pills.map((p) => (
            <View key={p.label} style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: p.bg }}>
              <Text style={{ fontSize: 10, fontWeight: "700", color: p.text }}>{p.label}</Text>
            </View>
          ))}
          {issue.breachCount !== undefined && issue.issues.includes("breached") && (
            <Text style={{ fontSize: 11, color: colors.danger, fontWeight: "600" }}>
              {formatBreachCount(issue.breachCount)}
            </Text>
          )}
          {issue.daysSinceChange !== undefined && issue.issues.includes("old") && (
            <Text style={{ fontSize: 11, color: colors.subText, alignSelf: "center" }}>
              {formatDays(issue.daysSinceChange)}
            </Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.subText} />
    </TouchableOpacity>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

type ScanPhase = "decrypting" | "checking-breaches" | "done";

export default function HealthScreen() {
  const router     = useRouter();
  const navigation = useNavigation();
  const insets     = useSafeAreaInsets();
  const { colors } = useTheme();

  const [status, setStatus]     = useState<"loading" | "done" | "error">("loading");
  const [phase, setPhase]       = useState<ScanPhase>("decrypting");
  const [progress, setProgress] = useState(0); // 0–100 for breach check progress
  const [report, setReport]     = useState<HealthReport | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [fadeAnim]              = useState(new Animated.Value(0));

  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);
  useEffect(() => { runScan(); }, []);

  const runScan = async () => {
    setStatus("loading");
    setPhase("decrypting");
    setProgress(0);
    setReport(null);
    setErrorMsg("");
    fadeAnim.setValue(0);

    try {
      // 1. Load all account keys
      const raw  = await Storage.getItemAsync(USER_ACCOUNT_KEYS);
      const keys: string[] = raw ? JSON.parse(raw) : [];

      // 2. Fetch PAT
      const pat         = await Storage.getItemAsync(GITHUB_PAT_KEY);
      const partialScan = !pat || pat.trim().length === 0;

      // 3. Load + decrypt accounts
      const snapshots: AccountSnapshot[] = (
        await Promise.all(
          keys.map(async (key): Promise<AccountSnapshot | null> => {
            try {
              const stored = await Storage.getItemAsync(key);
              if (!stored) return null;
              const parsed      = JSON.parse(stored);
              const isEncrypted = parsed.encrypted !== false;
              let decryptedPw   = "";

              if (!partialScan && isEncrypted && parsed.password) {
                try { decryptedPw = await decryptText(parsed.password, pat!); } catch { /* skip */ }
              } else if (!isEncrypted) {
                decryptedPw = parsed.password || "";
              }

              return {
                key,
                accountName: parsed.accountName || "(unnamed)",
                username:    parsed.username    || "",
                password:    decryptedPw,
                modifiedAt:  parsed.modifiedAt,
                createdAt:   parsed.createdAt,
                encrypted:   isEncrypted,
              };
            } catch { return null; }
          }),
        )
      ).filter(Boolean) as AccountSnapshot[];

      // 4. Breach check (skip if partial scan — no passwords to check)
      setPhase("checking-breaches");

      let breachResults: Map<string, { breached: boolean; count: number }> | undefined;

      if (!partialScan) {
        const passwordsToCheck = snapshots
          .filter((s) => s.password.length > 0)
          .map((s) => ({ key: s.key, password: s.password }));

        if (passwordsToCheck.length > 0) {
          // Run in batches of 5 and track progress
          const batchSize  = 5;
          const allResults = new Map<string, { breached: boolean; count: number }>();

          for (let i = 0; i < passwordsToCheck.length; i += batchSize) {
            const batch       = passwordsToCheck.slice(i, i + batchSize);
            const batchResult = await checkPasswordBreachesBatch(batch, batchSize);
            batchResult.forEach((v, k) => allResults.set(k, v));
            setProgress(Math.round(((i + batch.length) / passwordsToCheck.length) * 100));
          }

          breachResults = allResults;
        }
      }

      // 5. Analyse
      const result = analyseHealth(snapshots, partialScan, breachResults);
      setReport(result);
      setStatus("done");
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  const s = StyleSheet.create({
    screen:  { flex: 1, backgroundColor: colors.background },
    header:  { paddingTop: insets.top + 8, paddingBottom: 12, paddingHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 12 },
    title:   { fontSize: 20, fontWeight: "700", color: colors.text, flex: 1 },
    section: { fontSize: 13, fontWeight: "700", color: colors.subText, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },
    card:    { backgroundColor: colors.card, borderRadius: 16, padding: 20, marginBottom: 16 },
  });

  return (
    <View style={s.screen}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Password Health</Text>
        {status === "done" && (
          <TouchableOpacity onPress={runScan} hitSlop={12}>
            <Ionicons name="refresh-outline" size={22} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>

      {/* Loading */}
      {status === "loading" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: 32 }}>
          <ActivityIndicator size="large" color={colors.text} />

          {phase === "decrypting" && (
            <Text style={{ color: colors.subText, fontSize: 14, textAlign: "center" }}>
              Decrypting your vault…
            </Text>
          )}

          {phase === "checking-breaches" && (
            <View style={{ width: "100%", gap: 10, alignItems: "center" }}>
              <Text style={{ color: colors.subText, fontSize: 14, textAlign: "center" }}>
                Checking Have I Been Pwned…
              </Text>
              <Text style={{ color: colors.mutedText, fontSize: 12, textAlign: "center" }}>
                Your passwords are never sent — only a partial hash is used
              </Text>
              {/* Progress bar */}
              <View style={{ width: "100%", height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: "hidden" }}>
                <View style={{ height: "100%", width: `${progress}%`, backgroundColor: colors.otpPrimary, borderRadius: 3 }} />
              </View>
              <Text style={{ color: colors.mutedText, fontSize: 12 }}>{progress}%</Text>
            </View>
          )}
        </View>
      )}

      {/* Error */}
      {status === "error" && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 12 }}>
          <Ionicons name="warning-outline" size={48} color={colors.danger} />
          <Text style={{ color: colors.text, fontSize: 16, fontWeight: "600", textAlign: "center" }}>Scan failed</Text>
          <Text style={{ color: colors.subText, fontSize: 13, textAlign: "center" }}>{errorMsg}</Text>
          <TouchableOpacity onPress={runScan} style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 12, backgroundColor: colors.primary, borderRadius: 10 }}>
            <Text style={{ color: colors.background, fontWeight: "600" }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Results */}
      {status === "done" && report && (
        <Animated.ScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
          showsVerticalScrollIndicator={false}
          style={{ opacity: fadeAnim }}
        >
          {/* Partial-scan notice */}
          {report.partialScan && (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.warningBg, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Ionicons name="information-circle-outline" size={18} color={colors.warning} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.warning, lineHeight: 18 }}>
                No GitHub token configured — password strength, reuse, and breach checks are unavailable.
                Add your token in Settings to get a full report.
              </Text>
            </View>
          )}

          {/* Breach check skipped notice (has token but offline, etc.) */}
          {!report.partialScan && report.breachCheckSkipped && (
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, backgroundColor: colors.infoBg, borderRadius: 12, padding: 14, marginBottom: 16 }}>
              <Ionicons name="cloud-offline-outline" size={18} color={colors.otpPrimary} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 13, color: colors.otpPrimary, lineHeight: 18 }}>
                Breach check was skipped (no passwords to check). Add accounts with passwords to enable it.
              </Text>
            </View>
          )}

          {/* Score card */}
          <View style={[s.card, { alignItems: "center", gap: 16 }]}>
            <ScoreRing score={report.score} />
            <View style={{ alignItems: "center", gap: 4 }}>
              <Text style={{ fontSize: 15, fontWeight: "600", color: colors.text }}>Vault Health Score</Text>
              <Text style={{ fontSize: 13, color: colors.subText, textAlign: "center" }}>
                Based on {report.totalAccounts} account{report.totalAccounts !== 1 ? "s" : ""}
              </Text>
            </View>
            <View style={{ width: "100%", height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: "hidden" }}>
              <View style={{ height: "100%", width: `${report.score}%`, backgroundColor: scoreColor(report.score), borderRadius: 4 }} />
            </View>
          </View>

          {/* Stat cards — 2×2 grid */}
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
            <StatCard icon="shield-outline"  count={report.weakCount}     label="Weak"     color={colors.danger}     bg={colors.dangerBg}  />
            <StatCard icon="copy-outline"    count={report.reusedCount}   label="Reused"   color={colors.warning}    bg={colors.warningBg} />
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 24 }}>
            <StatCard icon="time-outline"    count={report.oldCount}      label={`${OLD_PASSWORD_DAYS_THRESHOLD}d+ Old`} color={colors.otpPrimary} bg={colors.infoBg} />
            <StatCard icon="skull-outline"   count={report.breachedCount} label="Breached" color={colors.danger}     bg={colors.dangerBg}  />
          </View>

          {/* HIBP badge */}
          {!report.breachCheckSkipped && !report.partialScan && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 20, backgroundColor: colors.successBg, borderRadius: 10, padding: 10 }}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
              <Text style={{ flex: 1, fontSize: 12, color: colors.success }}>
                Breach check powered by Have I Been Pwned — your passwords were never sent over the network.
              </Text>
            </View>
          )}

          {/* All-good state */}
          {report.issues.length === 0 && !report.partialScan && (
            <View style={{ alignItems: "center", gap: 12, paddingVertical: 40, backgroundColor: colors.successBg, borderRadius: 16 }}>
              <Ionicons name="checkmark-circle" size={52} color={colors.success} />
              <Text style={{ fontSize: 17, fontWeight: "700", color: colors.success }}>You're all good!</Text>
              <Text style={{ fontSize: 13, color: colors.success, textAlign: "center", paddingHorizontal: 20, opacity: 0.85 }}>
                No weak, reused, old, or breached passwords found.{"\n"}Keep it up! 🎉
              </Text>
            </View>
          )}

          {/* Issue list */}
          {report.issues.length > 0 && (
            <>
              <Text style={s.section}>
                {report.issues.length} Account{report.issues.length !== 1 ? "s" : ""} Need Attention
              </Text>
              {report.issues.map((issue) => (
                <IssueRow
                  key={issue.key}
                  issue={issue}
                  colors={colors}
                  onPress={() => router.push({ pathname: "/details/[key]", params: { key: issue.key } })}
                />
              ))}
            </>
          )}

          {/* Tips footer */}
          <View style={[s.card, { marginTop: 8 }]}>
            <Text style={[s.section, { marginBottom: 14 }]}>💡 Security Tips</Text>
            {[
              { icon: "shuffle-outline"          as const, tip: "Use the built-in password generator for new accounts." },
              { icon: "lock-closed-outline"       as const, tip: "Aim for 16+ character passwords with symbols." },
              { icon: "repeat-outline"            as const, tip: "Never reuse a password across different sites." },
              { icon: "shield-checkmark-outline"  as const, tip: "Enable 2FA on every account that supports it." },
              { icon: "calendar-outline"          as const, tip: `Update passwords every ${OLD_PASSWORD_DAYS_THRESHOLD} days for high-value accounts.` },
              { icon: "skull-outline"             as const, tip: "If a password appears in a breach, change it immediately — even if it looks strong." },
            ].map(({ icon, tip }) => (
              <View key={tip} style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
                <Ionicons name={icon} size={15} color={colors.subText} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 13, color: colors.subText, lineHeight: 18 }}>{tip}</Text>
              </View>
            ))}
          </View>
        </Animated.ScrollView>
      )}
    </View>
  );
}
