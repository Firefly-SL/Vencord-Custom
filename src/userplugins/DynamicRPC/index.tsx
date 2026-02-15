/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2023 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

import { definePluginSettings } from "@api/Settings";
import { getUserSettingLazy } from "@api/UserSettings";
import { Divider } from "@components/Divider";
import { ErrorCard } from "@components/ErrorCard";
import { Flex } from "@components/Flex";
import { Link } from "@components/Link";
import { Devs } from "@utils/constants";
import { isTruthy } from "@utils/guards";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { useAwaiter } from "@utils/react";
import definePlugin, { OptionType } from "@utils/types";
import { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findComponentByCodeLazy } from "@webpack";
import { ApplicationAssetUtils, Button, FluxDispatcher, Forms, React, UserStore } from "@webpack/common";

import { RPCSettings } from "./RpcSettings";

const useProfileThemeStyle = findByCodeLazy("profileThemeStyle:", "--profile-gradient-primary-color");
const ActivityView = findComponentByCodeLazy(".party?(0", "USER_PROFILE_ACTIVITY");

const ShowCurrentGame = getUserSettingLazy<boolean>("status", "showCurrentGame")!;

// Track current line indices and intervals for rotation
let detailsCurrentIndex = 0;
let stateCurrentIndex = 0;
let detailsIntervalId: ReturnType<typeof setInterval> | null = null;
let stateIntervalId: ReturnType<typeof setInterval> | null = null;
let lastDetailsLines: string[] = [];
let lastStateLines: string[] = [];

// Track initial timestamp for NOW mode to prevent resets
let nowModeStartTime: number | null = null;

function clearRotationIntervals() {
    if (detailsIntervalId) {
        clearInterval(detailsIntervalId);
        detailsIntervalId = null;
    }
    if (stateIntervalId) {
        clearInterval(stateIntervalId);
        stateIntervalId = null;
    }
}

function setupRotationIntervals() {
    clearRotationIntervals();
    
    const { detailsRandomMode, detailsRandomInterval, detailsRandomLines, stateRandomMode, stateRandomInterval, stateRandomLines } = settings.store;
    
    // Setup Details rotation
    if (detailsRandomMode && detailsRandomMode !== "disable" && detailsRandomLines && detailsRandomInterval && detailsRandomInterval > 0) {
        const lines = detailsRandomLines.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 1) {
            lastDetailsLines = lines;
            detailsIntervalId = setInterval(() => {
                if (detailsRandomMode === "yes") {
                    // Random mode
                    detailsCurrentIndex = Math.floor(Math.random() * lines.length);
                } else {
                    // Sequential mode
                    detailsCurrentIndex = (detailsCurrentIndex + 1) % lines.length;
                }
                setRpc();
            }, detailsRandomInterval * 1000);
        }
    }
    
    // Setup State rotation
    if (stateRandomMode && stateRandomMode !== "disable" && stateRandomLines && stateRandomInterval && stateRandomInterval > 0) {
        const lines = stateRandomLines.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 1) {
            lastStateLines = lines;
            stateIntervalId = setInterval(() => {
                if (stateRandomMode === "yes") {
                    // Random mode
                    stateCurrentIndex = Math.floor(Math.random() * lines.length);
                } else {
                    // Sequential mode
                    stateCurrentIndex = (stateCurrentIndex + 1) % lines.length;
                }
                setRpc();
            }, stateRandomInterval * 1000);
        }
    }
}

async function getApplicationAsset(key: string): Promise<string> {
    return (await ApplicationAssetUtils.fetchAssetIds(settings.store.appID!, [key]))[0];
}

export const enum TimestampMode {
    NONE,
    NOW,
    TIME,
    CUSTOM,
}

export const settings = definePluginSettings({
    config: {
        type: OptionType.COMPONENT,
        component: RPCSettings
    },
}).withPrivateSettings<{
    appID?: string;
    appName?: string;
    details?: string;
    detailsRandomLines?: string;
    detailsRandomMode?: "disable" | "yes" | "no";
    detailsRandomInterval?: number;
    detailsURL?: string;
    state?: string;
    stateRandomLines?: string;
    stateRandomMode?: "disable" | "yes" | "no";
    stateRandomInterval?: number;
    stateURL?: string;
    type?: ActivityType;
    streamLink?: string;
    timestampMode?: TimestampMode;
    startTime?: number;
    endTime?: number;
    imageBig?: string;
    imageBigURL?: string;
    imageBigTooltip?: string;
    imageSmall?: string;
    imageSmallURL?: string;
    imageSmallTooltip?: string;
    buttonOneText?: string;
    buttonOneURL?: string;
    buttonTwoText?: string;
    buttonTwoURL?: string;
    partySize?: number;
    partyMaxSize?: number;
}>();
async function createActivity(): Promise<Activity | undefined> {
    const {
        appID,
        appName,
        details,
        detailsRandomLines,
        detailsRandomMode,
        detailsURL,
        state,
        stateURL,
        stateRandomLines,
        stateRandomMode,
        type,
        streamLink,
        startTime,
        endTime,
        imageBig,
        imageBigURL,
        imageBigTooltip,
        imageSmall,
        imageSmallURL,
        imageSmallTooltip,
        buttonOneText,
        buttonOneURL,
        buttonTwoText,
        buttonTwoURL,
        partyMaxSize,
        partySize,
        timestampMode
    } = settings.store;

    if (!appName) return;

    let finalDetails = details;
    if (detailsRandomMode && detailsRandomMode !== "disable" && detailsRandomLines) {
        const lines = detailsRandomLines.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0) {
            // Use current index for rotation, or reset if lines changed
            if (lastDetailsLines.length !== lines.length || !lastDetailsLines.every((v, i) => v === lines[i])) {
                lastDetailsLines = lines;
                detailsCurrentIndex = 0;
            }
            if (detailsRandomMode === "yes") {
                // Random mode - pick random line
                finalDetails = lines[Math.floor(Math.random() * lines.length)];
            } else {
                // Sequential mode - use current index
                finalDetails = lines[detailsCurrentIndex % lines.length];
            }
        }
    }

    let finalState = state;
    if (stateRandomMode && stateRandomMode !== "disable" && stateRandomLines) {
        const lines = stateRandomLines.split('\n').filter(line => line.trim() !== '');
        if (lines.length > 0) {
            // Use current index for rotation, or reset if lines changed
            if (lastStateLines.length !== lines.length || !lastStateLines.every((v, i) => v === lines[i])) {
                lastStateLines = lines;
                stateCurrentIndex = 0;
            }
            if (stateRandomMode === "yes") {
                // Random mode - pick random line
                finalState = lines[Math.floor(Math.random() * lines.length)];
            } else {
                // Sequential mode - use current index
                finalState = lines[stateCurrentIndex % lines.length];
            }
        }
    }

    const activity: Activity = {
        application_id: appID || "0",
        name: appName,
        state: finalState,
        details: finalDetails,
        type: type ?? ActivityType.PLAYING,
        flags: 1 << 0,
    };

    if (type === ActivityType.STREAMING) activity.url = streamLink;

    switch (timestampMode) {
        case TimestampMode.NOW:
            // Use stored start time or initialize it if switching to NOW mode
            if (!nowModeStartTime) {
                nowModeStartTime = Date.now();
            }
            activity.timestamps = {
                start: nowModeStartTime
            };
            break;
        case TimestampMode.TIME:
            activity.timestamps = {
                start: Date.now() - (new Date().getHours() * 3600 + new Date().getMinutes() * 60 + new Date().getSeconds()) * 1000
            };
            break;
        case TimestampMode.CUSTOM:
            if (startTime || endTime) {
                activity.timestamps = {};
                if (startTime) activity.timestamps.start = startTime;
                if (endTime) activity.timestamps.end = endTime;
            }
            break;
        case TimestampMode.NONE:
        default:
            break;
    }

    if (detailsURL) {
        activity.details_url = detailsURL;
    }

    if (stateURL) {
        activity.state_url = stateURL;
    }

    if (buttonOneText) {
        activity.buttons = [
            buttonOneText,
            buttonTwoText
        ].filter(isTruthy);

        activity.metadata = {
            button_urls: [
                buttonOneURL,
                buttonTwoURL
            ].filter(isTruthy)
        };
    }

    if (imageBig) {
        activity.assets = {
            large_image: await getApplicationAsset(imageBig),
            large_text: imageBigTooltip || undefined,
            large_url: imageBigURL || undefined
        };
    }

    if (imageSmall) {
        activity.assets = {
            ...activity.assets,
            small_image: await getApplicationAsset(imageSmall),
            small_text: imageSmallTooltip || undefined,
            small_url: imageSmallURL || undefined
        };
    }

    if (partyMaxSize && partySize) {
        activity.party = {
            size: [partySize, partyMaxSize]
        };
    }

    for (const k in activity) {
        if (k === "type") continue;
        const v = activity[k];
        if (!v || v.length === 0)
            delete activity[k];
    }

    return activity;
}

export async function setRpc(disable?: boolean) {
    // Setup rotation intervals when enabling RPC
    if (!disable) {
        setupRotationIntervals();
    } else {
        clearRotationIntervals();
    }
    
    const activity: Activity | undefined = await createActivity();

    FluxDispatcher.dispatch({
        type: "LOCAL_ACTIVITY_UPDATE",
        activity: !disable ? activity : null,
        socketId: "CustomRPC",
    });
}

export default definePlugin({
    name: "DynamicRPC",
    description: "Add a fully customisable Rich Presence (Game status) to your Discord profile",
    authors: [Devs.captain, Devs.AutumnVN, Devs.nin0dev, Devs.firefly],
    dependencies: ["UserSettingsAPI"],
    // This plugin's patch is not important for functionality, so don't require a restart
    requiresRestart: false,
    settings,

    start: () => {
        // Initialize NOW mode timestamp when plugin starts
        if (settings.store.timestampMode === TimestampMode.NOW) {
            nowModeStartTime = Date.now();
        }
        setupRotationIntervals();
        setRpc();
    },
    stop: () => {
        clearRotationIntervals();
        nowModeStartTime = null;
        setRpc(true);
    },

    // Discord hides buttons on your own Rich Presence for some reason. This patch disables that behaviour
    patches: [
        {
            find: ".USER_PROFILE_ACTIVITY_BUTTONS),",
            replacement: {
                match: /.getId\(\)===\i.id/,
                replace: "$& && false"
            }
        }
    ],

    settingsAboutComponent: () => {
        const [activity] = useAwaiter(createActivity, { fallbackValue: undefined, deps: Object.values(settings.store) });
        const gameActivityEnabled = ShowCurrentGame.useSetting();
        const { profileThemeStyle } = useProfileThemeStyle({});

        return (
            <>
                {!gameActivityEnabled && (
                    <ErrorCard
                        className={classes(Margins.top16, Margins.bottom16)}
                        style={{ padding: "1em" }}
                    >
                        <Forms.FormTitle>Notice</Forms.FormTitle>
                        <Forms.FormText>Activity Sharing isn't enabled, people won't be able to see your custom rich presence!</Forms.FormText>

                        <Button
                            color={Button.Colors.TRANSPARENT}
                            className={Margins.top8}
                            onClick={() => ShowCurrentGame.updateSetting(true)}
                        >
                            Enable
                        </Button>
                    </ErrorCard>
                )}

                <Divider className={Margins.top8} />

                <div style={{ width: "284px", ...profileThemeStyle, marginTop: 8, borderRadius: 8, background: "var(--background-mod-muted)" }}>
                    {activity && <ActivityView
                        activity={activity}
                        user={UserStore.getCurrentUser()}
                        currentUser={UserStore.getCurrentUser()}
                    />}
                </div>
            </>
        );
    }
});
