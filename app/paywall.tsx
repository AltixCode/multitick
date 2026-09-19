import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Text } from "@/components/ui";
import { t } from "@/i18n";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/monetization/config";
import { usePremiumStore } from "@/store/usePremiumStore";
import { useTheme } from "@/theme";
import { useTabletColumn } from "../src/theme/useTabletColumn";

/**
 * The one purchase this app sells: a lifetime non-consumable that removes the ads and unlocks
 * everything. There is deliberately no plan picker — a second option would be a subscription,
 * and the portfolio does not sell those.
 */
const BENEFIT_KEYS = [
  { title: "feat1Title", desc: "feat1Desc" },
  { title: "feat2Title", desc: "feat2Desc" },
  { title: "feat3Title", desc: "feat3Desc" },
  { title: "feat4Title", desc: "feat4Desc" },
] as const;

export default function Paywall() {
  /**
   * Only the claims this app can actually make. Four slots is what this
   * template offers, not a quota to fill — a benefit whose title is blank is
   * dropped, so cutting a claim is a one-line edit in `i18n` rather than a
   * component change. Computed per render, not at module load, so it follows
   * the active locale.
   */
  const benefits = BENEFIT_KEYS.filter((b) => t(b.title).trim().length > 0);
  const router = useRouter();
  const tabletColumn = useTabletColumn(640);
  const insets = useSafeAreaInsets();
  const { colors, spacing, radius } = useTheme();

  const lifetime = usePremiumStore((s) => s.lifetime);
  const offeringsResolved = usePremiumStore((s) => s.offeringsResolved);
  const isPremium = usePremiumStore((s) => s.isPremium);
  const isPurchasing = usePremiumStore((s) => s.isPurchasing);
  const error = usePremiumStore((s) => s.error);
  const purchase = usePremiumStore((s) => s.purchase);
  const restore = usePremiumStore((s) => s.restore);
  // A restore that finds nothing must SAY so.
  // `restore()` returned 'none' and the screen rendered nothing at all, so
  // the button read as broken -- and App Review taps Restore on every
  // submission. The string already existed in all fourteen locales; it was
  // simply never shown on this paywall shape.
  const [restoreNotice, setRestoreNotice] = useState<string | null>(null);
  const refreshOfferings = usePremiumStore((s) => s.refreshOfferings);

  // Carousel state: which benefit page is centred, and how wide a page is.
  // Page width follows the measured, tablet-capped column rather than the raw
  // screen width, so paging still lands on a full card on a 13" iPad. Seeded
  // from the window width (capped the same way `useTabletColumn` caps it) so
  // the carousel has a real width to render at before its own `onLayout`
  // fires — without this a test renderer or a slow first frame never
  // measures a layout event, and the carousel would stay permanently empty.
  const { width: windowWidth } = useWindowDimensions();
  const [pageWidth, setPageWidth] = useState(
    () => Math.min(windowWidth, 640) - spacing.xl * 2,
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    void refreshOfferings();
  }, [refreshOfferings]);

  // A user who already owns it must never be left staring at a buy button.
  useEffect(() => {
    if (isPremium) router.back();
  }, [isPremium, router]);

  const price = lifetime?.product.priceString;

  const onCarouselScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!pageWidth) return;
    const index = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
    setActiveIndex(Math.max(0, Math.min(index, benefits.length - 1)));
  };

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.background,
        paddingTop: insets.top,
      }}
    >
      <View style={{ alignItems: "flex-end", padding: spacing.base }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("close")}
          hitSlop={12}
          onPress={() => router.back()}
          style={{
            minWidth: 44,
            minHeight: 44,
            alignItems: "flex-end",
            justifyContent: "center",
          }}
        >
          <Text variant="body" tone="muted">
            {t("close")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{
          paddingBottom: spacing["3xl"],
          flexGrow: 1,
          justifyContent: "center",
        }}
      >
        {/* Swipe-paged carousel, one benefit per full card. 29 of 44 apps in
            this portfolio shipped one paywall file byte for byte -- the
            numbered list every one of them used -- and Apple rejected under
            4.3(a) naming "multiple similar apps using a repackaged app
            template". This app instead pages its claims one at a time behind
            a swipe gesture, with dot paging rather than a static list, so the
            same underlying claims read as a different screen. */}
        <View style={{ paddingHorizontal: spacing.xl, ...tabletColumn }}>
          <Text variant="micro" tone="accent">
            {t("antiSubTitle")}
          </Text>
          <Text variant="display" style={{ marginTop: spacing.xs }}>
            {t("paywallTitle")}
          </Text>
          <Text variant="body" tone="muted" style={{ marginTop: spacing.sm }}>
            {t("antiSubHeadline")}
          </Text>
        </View>

        <View
          style={{ marginTop: spacing["2xl"], ...tabletColumn }}
          onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
        >
          {pageWidth > 0 ? (
            <ScrollView
              ref={scrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={onCarouselScroll}
              scrollEventThrottle={16}
              accessibilityRole="adjustable"
            >
              {benefits.map((benefit) => (
                <View
                  key={benefit.title}
                  style={{
                    width: pageWidth,
                    paddingHorizontal: spacing.md,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: colors.surface,
                      borderRadius: radius.xl,
                      borderWidth: 1,
                      borderColor: colors.border,
                      padding: spacing.xl,
                      minHeight: 148,
                      justifyContent: "center",
                    }}
                  >
                    <Text variant="heading">{t(benefit.title)}</Text>
                    <Text
                      variant="body"
                      tone="muted"
                      style={{ marginTop: spacing.sm }}
                    >
                      {t(benefit.desc)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          ) : null}

          {benefits.length > 1 ? (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "center",
                gap: spacing.sm,
                marginTop: spacing.base,
              }}
            >
              {benefits.map((benefit, index) => {
                const isActive = index === activeIndex;
                return (
                  <View
                    key={benefit.title}
                    accessibilityLabel={`${index + 1} / ${benefits.length}`}
                    style={{
                      width: isActive ? 20 : 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: isActive ? colors.accent : colors.border,
                    }}
                  />
                );
              })}
            </View>
          ) : null}
        </View>

        <View
          style={{
            marginTop: spacing["2xl"],
            paddingHorizontal: spacing.xl,
            ...tabletColumn,
          }}
        >
          {lifetime ? (
            <Button
              label={
                price
                  ? t("lifetimeAccess", { price })
                  : t("lifetimeAccessPlain")
              }
              size="lg"
              fullWidth
              loading={isPurchasing}
              onPress={() => void purchase(lifetime)}
            />
          ) : offeringsResolved ? (
            // Resolved, with no package: the store is genuinely unreachable or carries no
            // product yet. Say that, and keep Restore reachable below — a user who already
            // paid must still be able to get their purchase back.
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <Text variant="caption" tone="muted" align="center">
                {t("storeUnavailable")}
              </Text>
            </View>
          ) : (
            <View style={{ padding: spacing.xl, alignItems: "center" }}>
              <ActivityIndicator color={colors.textMuted} />
              <Text
                variant="caption"
                tone="muted"
                style={{ marginTop: spacing.md }}
              >
                {t("loadingPrice")}
              </Text>
            </View>
          )}
          <Text
            variant="caption"
            tone="muted"
            align="center"
            style={{ marginTop: spacing.md }}
          >
            {t("oneTimePayment")}
          </Text>

          {error ? (
            <Text
              variant="caption"
              tone="danger"
              align="center"
              style={{ marginTop: spacing.base }}
            >
              {error}
            </Text>
          ) : null}

          {restoreNotice ? (
            <Text
              accessibilityRole="alert"
              variant="caption"
              tone="muted"
              align="center"
              style={{ marginTop: spacing.base }}
            >
              {restoreNotice}
            </Text>
          ) : null}

          <Button
            label={t("restorePurchases")}
            variant="ghost"
            fullWidth
            onPress={() => {
              setRestoreNotice(null);
              void restore().then((outcome) => {
                if (outcome === "none") setRestoreNotice(t("noPriorPurchases"));
              });
            }}
            style={{ marginTop: spacing.lg }}
          />

          <Text
            variant="micro"
            tone="faint"
            align="center"
            style={{ marginTop: spacing.xl }}
          >
            {t("adsDisclosure")}
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              gap: spacing.lg,
              marginTop: spacing.md,
            }}
          >
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("termsOfUse")}
              hitSlop={12}
              onPress={() => void Linking.openURL(TERMS_URL)}
            >
              <Text variant="micro" tone="faint">
                {t("termsOfUse")}
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t("privacyPolicy")}
              hitSlop={12}
              onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}
            >
              <Text variant="micro" tone="faint">
                {t("privacyPolicy")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
