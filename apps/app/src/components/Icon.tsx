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

/**
 * ## Why each icon is imported from its own subpath
 *
 * `@tabler/icons-react-native` ships ~6,000 icons and its barrel
 * re-exports all of them. Metro does not tree-shake those re-exports,
 * so importing any named icon from the package root pulled the whole
 * library into the bundle: **4.6 MB of an 8.5 MiB web bundle, 53% of
 * it**, against 602 KB for every feature in the app put together. It
 * was the single largest thing Bookflow shipped to a browser, for 68
 * icons.
 *
 * The package's `exports` map has a `./*` subpath giving one module per
 * icon, so each import below costs exactly the icon it names. Keep it
 * that way: a single named import from `@tabler/icons-react-native`
 * anywhere in the graph brings all 6,000 back, and nothing in CI would
 * tell you except the bundle size.
 *
 * Sorted alphabetically, which is the only ordering that makes a
 * 68-line import block reviewable and a duplicate visible.
 */
import IconAlertCircle from '@tabler/icons-react-native/IconAlertCircle';
import IconAlertTriangle from '@tabler/icons-react-native/IconAlertTriangle';
import IconArrowLeft from '@tabler/icons-react-native/IconArrowLeft';
import IconArrowRight from '@tabler/icons-react-native/IconArrowRight';
import IconArrowsSort from '@tabler/icons-react-native/IconArrowsSort';
import IconBell from '@tabler/icons-react-native/IconBell';
import IconBook from '@tabler/icons-react-native/IconBook';
import IconBookFilled from '@tabler/icons-react-native/IconBookFilled';
import IconBooks from '@tabler/icons-react-native/IconBooks';
import IconBrain from '@tabler/icons-react-native/IconBrain';
import IconBrandAppleFilled from '@tabler/icons-react-native/IconBrandAppleFilled';
import IconCamera from '@tabler/icons-react-native/IconCamera';
import IconCheck from '@tabler/icons-react-native/IconCheck';
import IconChevronDown from '@tabler/icons-react-native/IconChevronDown';
import IconChevronLeft from '@tabler/icons-react-native/IconChevronLeft';
import IconChevronRight from '@tabler/icons-react-native/IconChevronRight';
import IconCircleCheck from '@tabler/icons-react-native/IconCircleCheck';
import IconClock from '@tabler/icons-react-native/IconClock';
import IconCloudUpload from '@tabler/icons-react-native/IconCloudUpload';
import IconCompass from '@tabler/icons-react-native/IconCompass';
import IconCompassFilled from '@tabler/icons-react-native/IconCompassFilled';
import IconCopy from '@tabler/icons-react-native/IconCopy';
import IconCreditCard from '@tabler/icons-react-native/IconCreditCard';
import IconDownload from '@tabler/icons-react-native/IconDownload';
import IconEye from '@tabler/icons-react-native/IconEye';
import IconFileText from '@tabler/icons-react-native/IconFileText';
import IconFilter from '@tabler/icons-react-native/IconFilter';
import IconHeadphones from '@tabler/icons-react-native/IconHeadphones';
import IconHeadphonesFilled from '@tabler/icons-react-native/IconHeadphonesFilled';
import IconHelpCircle from '@tabler/icons-react-native/IconHelpCircle';
import IconInfoCircle from '@tabler/icons-react-native/IconInfoCircle';
import IconListDetails from '@tabler/icons-react-native/IconListDetails';
import IconLoader2 from '@tabler/icons-react-native/IconLoader2';
import IconLock from '@tabler/icons-react-native/IconLock';
import IconLogout from '@tabler/icons-react-native/IconLogout';
import IconMail from '@tabler/icons-react-native/IconMail';
import IconMessageCircle from '@tabler/icons-react-native/IconMessageCircle';
import IconMicrophone from '@tabler/icons-react-native/IconMicrophone';
import IconMoon from '@tabler/icons-react-native/IconMoon';
import IconMusic from '@tabler/icons-react-native/IconMusic';
import IconNotebook from '@tabler/icons-react-native/IconNotebook';
import IconPhone from '@tabler/icons-react-native/IconPhone';
import IconPlayerPauseFilled from '@tabler/icons-react-native/IconPlayerPauseFilled';
import IconPlayerPlayFilled from '@tabler/icons-react-native/IconPlayerPlayFilled';
import IconPlayerSkipBack from '@tabler/icons-react-native/IconPlayerSkipBack';
import IconPlayerSkipForward from '@tabler/icons-react-native/IconPlayerSkipForward';
import IconPlayerTrackNext from '@tabler/icons-react-native/IconPlayerTrackNext';
import IconPlayerTrackPrev from '@tabler/icons-react-native/IconPlayerTrackPrev';
import IconPlus from '@tabler/icons-react-native/IconPlus';
import IconRefresh from '@tabler/icons-react-native/IconRefresh';
import IconSearch from '@tabler/icons-react-native/IconSearch';
import IconSettings from '@tabler/icons-react-native/IconSettings';
import IconShield from '@tabler/icons-react-native/IconShield';
import IconSparkles from '@tabler/icons-react-native/IconSparkles';
import IconStar from '@tabler/icons-react-native/IconStar';
import IconTextSize from '@tabler/icons-react-native/IconTextSize';
import IconThumbDown from '@tabler/icons-react-native/IconThumbDown';
import IconThumbDownFilled from '@tabler/icons-react-native/IconThumbDownFilled';
import IconThumbUp from '@tabler/icons-react-native/IconThumbUp';
import IconThumbUpFilled from '@tabler/icons-react-native/IconThumbUpFilled';
import IconTrash from '@tabler/icons-react-native/IconTrash';
import IconUpload from '@tabler/icons-react-native/IconUpload';
import IconUser from '@tabler/icons-react-native/IconUser';
import IconUserFilled from '@tabler/icons-react-native/IconUserFilled';
import IconWand from '@tabler/icons-react-native/IconWand';
import IconWifiOff from '@tabler/icons-react-native/IconWifiOff';
import IconWorld from '@tabler/icons-react-native/IconWorld';
import IconX from '@tabler/icons-react-native/IconX';
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
  ThumbUp: IconThumbUp,
  ThumbDown: IconThumbDown,
  ThumbUpFilled: IconThumbUpFilled,
  ThumbDownFilled: IconThumbDownFilled,
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
