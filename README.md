# Study tutor

GCSE revision that runs on your own computer. What is in it now:

- **Maths (Edexcel, 1MA1)**: Foundation is ready, with lessons and practice on 21 of its 38 topics.
  Higher topics are listed on the map, but their lessons are not written yet.
- **Combined Science (AQA Trilogy, 8464)**: started, with one lesson so far.
- **English Language and Literature (AQA, 8700 and 8702)**: the topics are listed so your child can
  track them, but there are no lessons or questions yet.

More is added as pupils need it. Tell us which subjects and topics your child needs most by
[opening an issue](https://github.com/linardsb/study-tutor/issues).

It works with no AI model at all. If you want the parts that use one, you add
a key from a model provider you pay for, and the key stays on your computer.
Your child's progress is kept in one folder on your computer, and none of it
is sent to us. If you add a model key, your child's questions, answers and photos of written work go
to that model provider to be marked. Apart from that, the one thing that leaves the computer is the
squad file, and only if your child uses the squad with friends (see
[Studying with friends](#studying-with-friends-the-squad)).

Setting it up takes about 15 minutes: download, first start and settings, 5 minutes each (an estimate).

## Download

- Windows: [StudyTutor-windows.zip](https://github.com/linardsb/study-tutor/releases/latest/download/StudyTutor-windows.zip)
- Mac: [StudyTutor-mac.zip](https://github.com/linardsb/study-tutor/releases/latest/download/StudyTutor-mac.zip)

The Windows zip is about 41 MB and the Mac zip about 47 MB. Allow 5 minutes.

## First start on a Mac

Allow 5 minutes.

1. Double-click `StudyTutor-mac.zip` to extract it. You get a folder called `StudyTutor` followed by a
   version number, for example `StudyTutor-0.1.2`. Move that folder somewhere that is not synced (see
   [Keep it out of OneDrive](#keep-it-out-of-onedrive-and-icloud)), such as a folder called `Tutor` in your
   home folder.
2. Open the folder and double-click `Start.command`.
3. The Mac says it cannot verify the file. Click **Done**.
4. Open **System Settings**, click **Privacy & Security**, scroll down to **Security**, and click
   **Open Anyway** next to the line about `Start.command`. Enter your password if asked.

   ![Privacy & Security with the Open Anyway button](docs/setup-mac.png)

5. Double-click `Start.command` again. If the Mac asks once more, choose to open it. A Terminal window
   opens with one line of text, then your browser opens on the tutor.

You only do steps 3 and 4 the first time for each version.

## First start on Windows

Allow 5 minutes.

1. Right-click `StudyTutor-windows.zip` and choose **Extract All**, then **Extract**. You get a folder
   called `StudyTutor` followed by a version number, for example `StudyTutor-0.1.2`. Extract it
   somewhere that is not synced (see [Keep it out of OneDrive](#keep-it-out-of-onedrive-and-icloud)), such
   as `C:\Tutor`.
2. Open that folder and double-click `Start.bat`.
3. If Windows says "Windows protected your PC", click **More info**, then **Run anyway**.
4. A black window opens with one line of text, then your browser opens on the tutor.

### The Windows firewall and the phone

Your child can photograph written working with a phone and send it to the tutor over your Wi-Fi. The
first time they click **Mark my written working**, Windows may ask whether to let StudyTutor use your
network.

- Allow it on private networks only.
- If Windows has your home Wi-Fi down as a public network, it blocks the phone even after you allow it.
  If it is your own home network, change it to private in Windows network settings.
- Windows asks again after each update, because each version is a new program to it.
- If the phone still cannot open the link, take the photo, move it to the computer, and use the link
  on that page to drop a photo on this computer instead.

## Keep it out of OneDrive and iCloud

Put the tutor's folder somewhere that is not synced to OneDrive, iCloud Drive, Dropbox or Google Drive.
Its `data` folder holds your child's records and your model key, and a synced folder copies both
online. Desktop and Documents are often synced without you knowing: OneDrive does this on many Windows
computers, and iCloud can on a Mac. A folder you make yourself, such as `C:\Tutor` on Windows or `Tutor`
in your home folder on a Mac, is safer.

## The settings page

Allow 5 minutes.

The first time, the home page lists three steps. The first is **Open settings**, and it is for a parent.

- **Provider**: pick the company whose model you pay for, or **No model**. With no model, lessons, practice
  and marking all work; only the parts that need a model are switched off.

The next two fields appear once you pick a provider.

- **Key**: paste the key from your provider's website. It is saved in the `data` folder on this computer
  and is only sent to that provider.
- **Tokens per month**: the most the tutor may use in a month, which puts a limit on the bill. When it is
  reached, the parts that need a model stop until the next month; everything else carries on.
- **Days a week with some practice**: the weekly target your child sees.
- **Squad sync folder**: optional, and only for the squad. See
  [Studying with friends](#studying-with-friends-the-squad).

Click **Save**. You can come back to it from the **Settings** link at the bottom of the main page.

## Choosing courses

Allow 2 minutes. Your child does this, and you can help.

The second step on the home page is **Start here**. The first thing it asks for is **Your courses**:
tick each course your child takes and, for maths and science, pick **Foundation** or **Higher**. Then
click **Save courses**. The map, the cold test and the topic lists then show only those courses.

- Pick only the courses your child takes. English has no lessons yet, so ticking it only adds rows to
  the map.
- To change the courses later, open **Start here** and click **Change courses**. Progress on a course
  you untick is kept, and comes back if you tick it again.
- If you updated from version 0.1.1, the tutor does not ask for courses by itself. Open **Start here**
  from the main page and choose them, or the map shows every topic of every subject.

## Studying with friends (the squad)

The squad lets a few friends, each on their own computer, do the same five maths questions each
week and see how the group did. No one is ranked. The week ends on Sunday.

1. Everyone opens **Squad** and types the same **Squad name**, for example `sackville-11c`. For **Your
   name**, each pupil picks a name no one else in the squad uses. Two pupils with the same name
   overwrite each other's file without a warning, and `Alex` and `alex` count as the same name.
2. Each pupil does the week's round of five questions.
3. The files are shared in one of two ways.

**Without a shared folder.** After the round, your child clicks **Save my file**. You pass that file
to each friend's parent, for example by email, and they put it in the folder the squad page shows. That
folder only exists once your child has done their own round. You do this every week.

**With a shared folder.** One parent makes a folder in Google Drive, OneDrive or iCloud Drive and
shares it with the other families. Each parent then types that folder's full path into **Squad sync
folder** on the settings page, for example `C:\Users\you\OneDrive\Squad` on Windows or
`/Users/you/Library/Mobile Documents/com~apple~CloudDocs/Squad` on a Mac. The tutor writes your child's
file there and reads the friends' files by itself. Only the squad folder is shared; the tutor's own
folder stays out of it. If the squad page says a file could not be written, check the sync app is
running and the path in settings is still right.

**What the squad file holds**: the squad name, your child's squad name, the week, the five answers
with any working your child wrote, and which ones were right. It does not hold the key, other
progress or the courses. Anyone with the file can read it, so use a first name or a nickname, and a
squad name that does not have to name the school.

## Updating to a new version

When a new version is out, the tutor's main page says so and links to the download. Allow 10 minutes.

1. Stop the tutor: close the browser tab, then close the window that started it.
2. Download the new zip and extract it. It makes a new folder with the new version number, for example
   `StudyTutor-0.2.0`. Keep it next to the old one.
3. In the old folder, right-click the `data` folder and choose **Copy**. Open the new folder, right-click
   an empty space and choose **Paste** (on a Mac it says **Paste Item**).
4. Start the new version from its own folder and check your child's progress is there.
5. Only then delete the old folder.

Copy, do not move. Until step 5 the old folder still has everything, so you can go back to it.

- Do not copy the new folder over the old one.
- If the tutor asks for setup again, you started the new folder without its `data` folder. Close it and
  do step 3.
- The Mac or Windows warning from the first start comes back after each update, and so does the Windows
  firewall question. Answer them the same way.
- If the tutor stops with "this version of the tutor would lower progress", start the old folder again
  and tell us.

## Where the records live

All of your child's records are in the `data` folder inside the tutor's folder. To back
it up, copy that folder somewhere safe. Do not share `config.json` from it: it holds your key. Do not
move the tutor's folder into OneDrive or iCloud to back it up: that syncs the key too.

## Stopping the tutor

Close the browser tab, then close the window that started the tutor. On a Mac, click **Terminate** if it
asks.
