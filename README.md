# Sound Neighbors

Sound Neighbors connects teen musicians with senior centers, hospitals, and community groups that want live music. It lets teens use their talent to actually help their community.

 

## Technolgy stack - 
Frontend - Plain HTML, CSS, JavaScript 
Backend - Firebase (Authentication, Firestore, Hosting). 

## To run the app locally

```
git clone <this repo> && cd sound_neighbors
npx firebase-tools serve        
# or: python3 -m http.server 5000 --directory public
```

Open http://localhost:5000. With no Firebase settings the app runs in **demo mode**: fake accounts and data
saved in your browser. You can force it any time by adding `?demo` to the URL.

##  To deploy and run the app with Firebase

1. Create a Firebase project. Enable **Authentication, Email/Password** and create a **Firestore** database.
2. `npm install -g firebase-tools`, then `firebase login`.
3. Copy `.firebaserc.example` to `.firebaserc` and put in your project ID.
4. Create `public/js/config.local.js` (it is git-ignored) with your web app's settings:

   ```js
   export const firebaseConfig = {
     apiKey: "...", authDomain: "...", projectId: "...", appId: "..."
   };
   ```

5. Read [firestore.rules](firestore.rules), then deploy rules and indexes: `firebase deploy --only firestore:rules,firestore:indexes`.
6. Run locally with `firebase serve`, or deploy with `firebase deploy --only hosting`.
7. Approvals are manual, in the Firestore console (`users` collection): set `parentApproved: true` on a teen, and
   `verified: true` on an organizer you trust. Verified organizers can hear clips, see teen records, and confirm hours.


## To run tests

```
npm install
npm test            # planner, data, badges, age check, and demo-backend workflow tests (no Firebase needed)
npm run test:rules  # security rules, against the local Firestore emulator 
```

## Project layout

| Key Files | Description|
| --- | --- |
| `public/js/planner.js` | The set planner. It including logic for scoring and bulding a set for performance based on gig requirements. |
| `public/js/backend-firebase.js`, `backend-local.js` | The same data API twice: Firebase, and demo mode.  |
| `public/js/views/` | Screens for teens, organizers, the planner, and impact |
| `public/data/songs.json` | The song library |
| `firestore.rules` | Security rules |
| `tests/` | Unit, workflow, and rules tests |


## License

[MIT](LICENSE). Fonts are loaded from Google Fonts (Bricolage Grotesque and Figtree, SIL Open Font License).
