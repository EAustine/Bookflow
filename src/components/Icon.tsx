/**
 * Icon — canonical Tabler icons wrapper.
 *
 * Always use this component, never raw `@tabler/icons-react-native` imports
 * in screens. This wrapper enforces:
 *   - 1.5px stroke width (matches design language; Tabler default is 2)
 *   - Default size of 18px (the system default)
 *   - Default color from ink-700
 *
 * Per /docs/specs/bookflow_input_system.html, icon library section.
 */

import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCamera,
  IconCircleCheck,
  IconCopy,
  IconThumbDownFilled,
  IconThumbUpFilled,
  IconArrowLeft,
  IconArrowRight,
  IconArrowsSort,
  IconBell,
  IconBrandAppleFilled,
  IconCompassFilled,
  IconHeadphonesFilled,
  IconUserFilled,
  IconBook,
  IconBookFilled,
  IconBooks,
  IconBrain,
  IconCheck,
  IconChevronDown,
  IconChevronLeft,
  IconClock,
  IconChevronRight,
  IconCloudUpload,
  IconCompass,
  IconCreditCard,
  IconDownload,
  IconEye,
  IconFileText,
  IconFilter,
  IconHeadphones,
  IconHelpCircle,
  IconInfoCircle,
  IconListDetails,
  IconLoader2,
  IconLock,
  IconLogout,
  IconMail,
  IconMessageCircle,
  IconMicrophone,
  IconMusic,
  IconNotebook,
  IconMoon,
  IconPhone,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlayerSkipBack,
  IconPlayerSkipForward,
  IconPlayerTrackNext,
  IconPlayerTrackPrev,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconShield,
  IconSparkles,
  IconStar,
  IconTextSize,
  IconTrash,
  IconUpload,
  IconUser,
  IconWand,
  IconWifiOff,
  IconWorld,
  IconX,
} from '@tabler/icons-react-native';
import type { ComponentType } from 'react';
import { tokens } from '~/design/tokens';

type TablerIconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

/**
 * Public icon name registry. Keep these names stable across icon library
 * swaps so screens don't have to change. Internally each name maps to its
 * Tabler glyph below.
 */
const ICON_MAP = {
  // Brand
  Apple: IconBrandAppleFilled,
  // Tab filled states
  CompassFilled: IconCompassFilled,
  HeadphonesFilled: IconHeadphonesFilled,
  UserFilled: IconUserFilled,
  // Navigation
  ArrowLeft: IconArrowLeft,
  ArrowRight: IconArrowRight,
  ArrowsSort: IconArrowsSort,
  Filter: IconFilter,
  ChevronRight: IconChevronRight,
  ChevronLeft: IconChevronLeft,
  ChevronDown: IconChevronDown,
  Compass: IconCompass,
  X: IconX,
  // Actions
  Plus: IconPlus,
  Search: IconSearch,
  Check: IconCheck,
  Camera: IconCamera,
  Copy: IconCopy,
  ThumbUp: IconThumbUpFilled,
  ThumbDown: IconThumbDownFilled,
  // Reading & audio
  Book: IconBook,
  BookOpen: IconBookFilled,
  Books: IconBooks,
  Brain: IconBrain,
  CloudUpload: IconCloudUpload,
  Headphones: IconHeadphones,
  Microphone: IconMicrophone,
  Notebook: IconNotebook,
  Moon: IconMoon,
  Play: IconPlayerPlayFilled,
  // Filled to match the Play counterpart — both render on a white play
  // button where stroked icons (with strokeWidth=0 for solid look)
  // disappear entirely. Filled glyphs paint regardless of stroke width.
  Pause: IconPlayerPauseFilled,
  PlayerSkipBack: IconPlayerSkipBack,
  PlayerSkipForward: IconPlayerSkipForward,
  PlayerTrackPrev: IconPlayerTrackPrev,
  PlayerTrackNext: IconPlayerTrackNext,
  TextSize: IconTextSize,
  Upload: IconUpload,
  Clock: IconClock,
  ListDetails: IconListDetails,
  Music: IconMusic,
  Wand: IconWand,
  // Communication
  MessageCircle: IconMessageCircle,
  Mail: IconMail,
  Bell: IconBell,
  // System
  Settings: IconSettings,
  User: IconUser,
  Lock: IconLock,
  Logout: IconLogout,
  Eye: IconEye,
  Globe: IconWorld,
  // States
  AlertCircle: IconAlertCircle,
  CheckCircle: IconCircleCheck,
  AlertTriangle: IconAlertTriangle,
  HelpCircle: IconHelpCircle,
  Info: IconInfoCircle,
  Loader: IconLoader2,
  Sparkles: IconSparkles,
  Star: IconStar,
  CreditCard: IconCreditCard,
  Download: IconDownload,
  FileText: IconFileText,
  Phone: IconPhone,
  Refresh: IconRefresh,
  Shield: IconShield,
  Trash: IconTrash,
  WifiOff: IconWifiOff,
} as const satisfies Record<string, ComponentType<TablerIconProps>>;

export type IconName = keyof typeof ICON_MAP;

export const APPROVED_ICONS = Object.keys(ICON_MAP) as readonly IconName[];

export type IconProps = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({
  name,
  size = tokens.iconSize.sm,
  color = tokens.colors.ink[700],
  strokeWidth = tokens.iconStrokeWidth,
}: IconProps) {
  const Component = ICON_MAP[name];

  if (!Component) {
    if (__DEV__) {
      console.warn(`[Icon] "${name}" is not a registered icon name`);
    }
    return null;
  }

  return <Component size={size} color={color} strokeWidth={strokeWidth} />;
}
