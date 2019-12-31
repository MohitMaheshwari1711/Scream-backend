const functions = require("firebase-functions");
const express = require("express");
const app = express();
const cors = require('cors');
app.use(cors());
const auth = require("./util/auth");
const { db } = require("./util/admin");


const { getAllScreams, postOneScream, getScream, commentOnScream, likeScream, unlikeScream, deleteScream } = require("./handlers/screams");
const { markNotificationsRead, getUserDetails, getAuthenticatedUser, addUserDetails, uploadImage, signUp, login } = require("./handlers/users");

// Scream Routes
app.get("/screams", getAllScreams);

// Get Scream Details
app.get("/scream/:screamId", getScream);

// Delete Scream
app.delete("/scream/:screamId", auth, deleteScream);

// Like a Scream
app.get("/scream/:screamId/like", auth, likeScream);

// Unlike a Scream
app.get("/scream/:screamId/unlike", auth, unlikeScream);

// Comment on Scream
app.post("/scream/:screamId/comment", auth, commentOnScream);

// Get User Details
app.get("/user", auth, getAuthenticatedUser);

// Get Any User Details
app.get("/user/:handle", getUserDetails);

// Post Screams
app.post("/scream", auth, postOneScream);

// Image Post
app.post("/user/image", auth, uploadImage);

//Signup Route
app.post("/signup", signUp);

// Login Route
app.post("/login", login);

// Add User Details
app.post("/user", auth, addUserDetails);

// Create Notifications
app.post("/notifications", auth, markNotificationsRead);

exports.api = functions.region("europe-west1").https.onRequest(app);

exports.createNotificationOnLike = functions.region("europe-west1").firestore.document('likes/{id}').onCreate(
    (snapshot) => {
        return db.doc(`/screams/${snapshot.data().screamId}`).get()
            .then((doc) => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'like',
                        read: false,
                        screamId: doc.id
                    });
                }
            }).catch(
                (err) => {
                    console.error(err);
                }
            )
    }
);



exports.deleteNotificationOnUnlike = functions.region("europe-west1").firestore.document('likes/{id}').onDelete(
    (snapshot) => {
        return db.doc(`/notifications/${snapshot.id}`).delete()
            .catch(
                (err) => {
                    console.error(err);
                    return;
                }
            );
    }
);




exports.createNotificationOnComment = functions.region("europe-west1").firestore.document('comments/{id}').onCreate(
    (snapshot) => {
        return db.doc(`/screams/${snapshot.data().screamId}`).get()
            .then((doc) => {
                if (doc.exists && doc.data().userHandle !== snapshot.data().userHandle) {
                    return db.doc(`/notifications/${snapshot.id}`).set({
                        createdAt: new Date().toISOString(),
                        recipient: doc.data().userHandle,
                        sender: snapshot.data().userHandle,
                        type: 'comment',
                        read: false,
                        screamId: doc.id
                    });
                }
            }).catch(
                (err) => {
                    console.error(err);
                    return;
                }
            )
    }
);




exports.onUserImageChange = functions.region("europe-west1").firestore.document('/users/{userId}').onUpdate(
    (change) => {
        if (change.before.data().imageUrl !== change.after.data().imageUrl) {
            const batch = db.batch();
            return db.collection('screams').where('userHandle', '==', change.before.data().handle).get().then(
                (data) => {
                    data.forEach((doc) => {
                        const scream = db.doc(`/screams/${doc.id}`);
                        batch.update(scream, { userImage: change.after.data().imageUrl });
                    });
                    return batch.commit();
                }
            );
        } else {
            return true;
        }
    }
);




exports.onScreamDelete = functions.region("europe-west1").firestore.document('/screams/{screamId}').onDelete(
    (snapshot, context) => {
        const screamId = context.params.screamId;
        const batch = db.batch();
        return db.collection('comments').where('screamId', '==', screamId).get().then(
            (data) => {
                data.forEach((doc) => {
                    batch.delete(db.doc(`/comments/${doc.id}`));
                });
                return db.collection('likes').where('screamId', '==', screamId).get();
            }).then(
                (data) => {
                    data.forEach((doc) => {
                        batch.delete(db.doc(`/likes/${doc.id}`));
                    });
                    return db.collection('notifications').where('screamId', '==', screamId).get();
                }
            ).then(
                (data) => {
                    data.forEach((doc) => {
                        batch.delete(db.doc(`/notifications/${doc.id}`));
                    });
                    return batch.commit();
                }
            )
            .catch(
                (err) => {
                    console.error(err);

                }
            );
    }
); 
