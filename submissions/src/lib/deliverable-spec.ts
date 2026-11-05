import type { DeliverableKind } from "./db/schema";

/**
 * Transcribed from the Deliverables section of each project_*.html page.
 *
 * Deliberately data, not code: when a project page changes, this list changes
 * and `npm run db:deliverables` re-syncs it. Nothing about the upload flow
 * needs touching.
 *
 * No zip files anywhere, with exactly one exception -- the KiCad manufacturing
 * and drill output is many Gerber files and has no single-file form.
 */

const MB = 1024 * 1024;

/**
 * Per-file caps. These are only half the protection: the other half is the
 * account-wide ceiling in src/lib/quota.ts, which refuses every upload once
 * total stored bytes reach the limit, so no combination of files can run the
 * bill up.
 *
 * A 60-second clip at 720p is roughly 10-20 MB; phones default to 1080p or 4K,
 * which is not, so students may still have to lower resolution occasionally.
 */
export const KIND_RULES: Record<
  DeliverableKind,
  { maxBytes: number; maxSeconds: number | null; allowedExtensions: string[] }
> = {
  video: { maxBytes: 50 * MB, maxSeconds: 60, allowedExtensions: [".mp4", ".mov", ".webm"] },
  photo: {
    maxBytes: 15 * MB,
    maxSeconds: null,
    // .heic is deliberately absent: iPhones shoot it by default, but Chrome and
    // Firefox cannot render it in an <img>, so instructors would see a broken
    // image for every iPhone photo. iOS can export JPEG from the share sheet.
    allowedExtensions: [".jpg", ".jpeg", ".png", ".webp"],
  },
  sketch: { maxBytes: 1 * MB, maxSeconds: null, allowedExtensions: [".ino"] },
  kicad: {
    maxBytes: 10 * MB,
    maxSeconds: null,
    allowedExtensions: [".kicad_pro", ".kicad_pcb", ".kicad_sch"],
  },
  archive: { maxBytes: 50 * MB, maxSeconds: null, allowedExtensions: [".zip"] },
};

export type SeedDeliverable = {
  kind: DeliverableKind;
  label: string;
  instructions?: string;
  /** Narrow the allowed extensions below the kind default, e.g. one KiCad file. */
  only?: string[];
};

export type SeedProject = {
  slug: string;
  label: string;
  title: string;
  pageUrl: string;
  deliverables: SeedDeliverable[];
};

const KICAD_TRIO: SeedDeliverable[] = [
  { kind: "kicad", label: "KiCad project file", instructions: "The .kicad_pro file.", only: [".kicad_pro"] },
  { kind: "kicad", label: "KiCad PCB file", instructions: "The .kicad_pcb file.", only: [".kicad_pcb"] },
  { kind: "kicad", label: "KiCad schematic file", instructions: "The .kicad_sch file.", only: [".kicad_sch"] },
];

export const PROJECT_SPEC: SeedProject[] = [
  {
    slug: "project_1",
    label: "Project 1",
    title: "LED There Be Light",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_1.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of your soldered perfboard",
        instructions:
          "Demonstrate the switch in both states (ON and OFF), and show the soldered side of the perfboard.",
      },
    ],
  },
  {
    slug: "project_2",
    label: "Project 2",
    title: "555 Piano",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_2.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of the 555 LED Blinker (Schematic A) on a breadboard",
        instructions: "The video should clearly show the LED blinking ON and OFF.",
      },
      {
        kind: "video",
        label: "Video of the 555 Piano (Schematic B) on a breadboard",
        instructions: "Press each button in the video. The video must include sound.",
      },
      {
        kind: "video",
        label: "Video of the 555 Piano (Schematic B) soldered to the PCB",
        instructions:
          "Press each button and show the soldered side. The video must include sound.",
      },
    ],
  },
  {
    slug: "project_3",
    label: "Project 3",
    title: "RGB LED Wizard",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_3.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of the RGB LED Dimmer (Schematic C) on a breadboard",
        instructions:
          "Use the potentiometers to create the colors yellow, green, and cyan.",
      },
    ],
  },
  {
    slug: "project_4",
    label: "Project 4",
    title: "Arduino Radar",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_4.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of the Potentiometer-Controlled Servo on a breadboard",
        instructions: "Showcase the 0–180° movement of the servo using a potentiometer.",
      },
      {
        kind: "video",
        label: "Video of the Arduino Radar and the Processing display",
        instructions:
          "Showcase automatic sweeping, button-controlled mode switching, manual control with the potentiometer, and object detection on the Processing display.",
      },
    ],
  },
  {
    slug: "project_5",
    label: "Project 5",
    title: "iPoduino v2",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_5.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of the iPoduino (Schematic C) on a breadboard",
        instructions:
          "Cycle through the three minimum songs. Toggle the Play/Pause button for at least one song.",
      },
      {
        kind: "sketch",
        label: "iPoduino sketch file",
        instructions: "All of the code you wrote for the final checkpoint.",
      },
    ],
  },
  {
    slug: "project_6",
    label: "Project 6",
    title: "Wireless Weather Station",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_6.html",
    deliverables: [
      {
        kind: "photo",
        label: "Photo of the weather station (transmitter) ESP32 board",
        instructions:
          "Must show the AHT20, the light sensor, and one ESP32 correctly wired together.",
      },
      {
        kind: "photo",
        label: "Photo of the receiver ESP32 board",
        instructions:
          "Must show the ESP32 and LCD correctly wired together, with the LCD clearly displaying temperature, humidity, and time of day (day or night).",
      },
      {
        kind: "sketch",
        label: "Transmitter Arduino sketch",
        instructions: "Name it ops_project6_transmitter.ino.",
      },
      {
        kind: "sketch",
        label: "Receiver Arduino sketch",
        instructions: "Name it ops_project6_receiver.ino.",
      },
    ],
  },
  {
    slug: "project_7",
    label: "Project 7",
    title: "Kitchen Timer",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_7.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of the digital stopwatch ESP32 board",
        instructions:
          "Must show the TM1637, two pushbuttons, piezo buzzer and ESP32 correctly wired together. Demonstrate seconds and minutes displaying properly, including the update from 50 seconds to 1 minute 10 seconds. Start, pause, resume, and stop the stopwatch, then start it once more.",
      },
      {
        kind: "sketch",
        label: "Digital stopwatch Arduino sketch",
        instructions: "Name it ops_project7.ino.",
      },
    ],
  },
  {
    slug: "project_8",
    label: "Project 8",
    title: "Capstone PCB Design",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_8.html",
    deliverables: [
      ...KICAD_TRIO,
      {
        kind: "archive",
        label: "Manufacturing and drill files",
        instructions:
          "Zip the folder containing the manufacturing and drill files. This is the only OPS deliverable submitted as a zip, because Gerber output is many files.",
      },
    ],
  },
  {
    slug: "capstone_pcb",
    label: "Capstone — PCB",
    title: "RC Rover: PCB Design",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_capstone.html",
    deliverables: [...KICAD_TRIO],
  },
  {
    slug: "capstone_final",
    label: "Capstone — Final",
    title: "RC Rover: Final Submission",
    pageUrl: "https://ieee.ics.uci.edu/ops-webpages/project_capstone.html",
    deliverables: [
      {
        kind: "video",
        label: "Video of your rover and the remote control",
        instructions:
          "Demonstrate the rover moving forward, backward, left, and right, showing the remote as well. Then switch to autonomous mode and show the rover avoiding at least 2 obstacles, making at least 2 turns.",
      },
      {
        kind: "sketch",
        label: "Rover ESP32 sketch",
        instructions: "Name it capstone_rover.ino.",
      },
      {
        kind: "sketch",
        label: "Remote control ESP32 sketch",
        instructions: "Name it capstone_remote.ino.",
      },
    ],
  },
];

/** Resolve a seed entry into the row that gets stored. */
export function resolveRules(d: SeedDeliverable) {
  const base = KIND_RULES[d.kind];
  return {
    maxBytes: base.maxBytes,
    maxSeconds: base.maxSeconds,
    allowedExtensions: d.only ?? base.allowedExtensions,
  };
}
