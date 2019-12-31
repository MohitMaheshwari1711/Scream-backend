const { admin, db } = require("../util/admin");
const BusBoy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { validateSignupData, validateLoginData, reduceUserDetails } = require("../util/validators");
const firebase = require("firebase");

const config = require('../util/config');
firebase.initializeApp(config);





// Add User Details
exports.addUserDetails = (req, res) => {
  let userDetails = reduceUserDetails(req.body);
  db.doc(`/users/${req.user.handle}`).update(userDetails).then(
    () => {
      return res.json({
        message: 'Details added successfully'
      });
    }).catch(
      (err) => {
        console.error(err);
        return res.status(500).json({
          error: err.code
        })
      }
    )
}




// Get User Details
exports.getAuthenticatedUser = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.user.handle}`).get().then(
    (doc) => {
      if (doc.exists) {
        userData.credentials = doc.data();
        return db.collection('likes').where('userHandle', '==', req.user.handle).get();
      }
    }).then(
      (data) => {
        userData.likes = [];
        data.forEach((doc) => {
          userData.likes.push(doc.data());
        });
        return db.collection('notifications').where('recipient', '==', req.user.handle).orderBy('createdAt', 'desc').limit(10).get();
      }).then(
        (data) => {
          userData.notifications = [];
          data.forEach((doc) => {
            userData.notifications.push({
              recipient: doc.data().recipient,
              sender: doc.data().sender,
              createdAt: doc.data().createdAt,
              screamId: doc.data().screamId,
              type: doc.data().type,
              read: doc.data().read,
              notificationId: doc.id
            });
          });
          return res.json(userData);
        }
      ).catch(
        (err) => {
          console.error(err);
          return res.status(500).json(
            { error: err.code }
          )
        });
}



exports.getUserDetails = (req, res) => {
  let userData = {};
  db.doc(`/users/${req.params.handle}`).get().then(
    (doc) => {
      if (doc.exists) {
        userData.user = doc.data();
        return db.collection('screams').where('userHandle', '==', req.params.handle).orderBy('createdAt', 'desc').get();
      } else {
        return res.status(404).json({
          error: 'User not found'
        });
      }
    }).then(
      (data) => {
        userData.screams = [];
        data.forEach(
          (doc) => {
            userData.screams.push({
              body: doc.data().body,
              createdAt: doc.data().createdAt,
              userHandle: doc.data().userHandle,
              userImage: doc.data().userImage,
              likeCount: doc.data().likeCount,
              commentCount: doc.data().commentCount,
              screamId: doc.id
            });
          });
        return res.json(userData);
      }).catch(
        (err) => {
          console.error(err);
          return res.status(500).json({
            error: err.code
          });
        });
}



// Upload Profile Image
exports.uploadImage = (req, res) => {
  let busboy = new BusBoy({ headers: req.headers });
  let imageFileName;
  let imageToBeUploaded = {};

  busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
    if (mimetype !== 'image/jpeg' && mimetype !== 'image/png') {
      return res.status(400).json({
        error: 'Wrong file type submitted'
      });
    }
    const imageExtension = filename.split('.')[filename.split('.').length - 1];
    imageFileName = `${Math.round(Math.random() * 100000000000)}.${imageExtension}`;
    const filePath = path.join(os.tmpdir(), imageFileName);
    imageToBeUploaded = { filePath, mimetype };
    file.pipe(fs.createWriteStream(filePath));
  });

  busboy.on('finish', () => {
    admin.storage().bucket().upload(imageToBeUploaded.filePath, {
      resumable: false,
      metadata: {
        metadata: {
          contentType: imageToBeUploaded.mimetype
        }
      }
    }).then(
      () => {
        const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${imageFileName}?alt=media`;
        return db.doc(`/users/${req.user.handle}`).update({ imageUrl: imageUrl });
      }).then(
        () => {
          return res.json({
            message: 'Image uploaded successfully'
          });
        }).catch(
          (err) => {
            console.error(err);
            return res.status(500).json({ error: err.code });
          });
  });
  busboy.end(req.rawBody);
}




// User SignUp
exports.signUp = (req, res) => {
  const newUser = {
    email: req.body.email,
    password: req.body.password,
    confirmPassword: req.body.confirmPassword,
    handle: req.body.handle
  }

  const { valid, errors } = validateSignupData(newUser);

  if (!valid) {
    return res.status(400).json(errors);
  }

  const noImg = 'blank-profile-picture.png';

  let token, userId;

  db.doc(`/users/${newUser.handle}`)
    .get()
    .then(doc => {
      if (doc.exists) {
        return res.status(400).json({
          handle: "This handle is already taken"
        });
      } else {
        return firebase
          .auth()
          .createUserWithEmailAndPassword(newUser.email, newUser.password);
      }
    })
    .then(data => {
      userId = data.user.uid;
      return data.user.getIdToken();
    })
    .then(idtoken => {
      token = idtoken;
      const userCredentials = {
        handle: newUser.handle,
        email: newUser.email,
        createdAt: new Date().toISOString(),
        imageUrl: `https://firebasestorage.googleapis.com/v0/b/${config.storageBucket}/o/${noImg}?alt=media`,
        userId
      };
      return db.doc(`/users/${newUser.handle}`).set(userCredentials);
    })
    .then(() => {
      return res.status(201).json({ token });
    })
    .catch(err => {
      if (err.code === "auth/email-already-in-use") {
        return res.status(400).json({
          email: "Email is already in use"
        });
      } else {
        return res.status(500).json({
          error: 'Something went wrong. Please try again'
        });
      }
    });
}




// User Login
exports.login = (req, res) => {
  const user = {
    email: req.body.email,
    password: req.body.password
  }

  const { valid, errors } = validateLoginData(user);

  if (!valid) {
    return res.status(400).json(errors);
  }

  firebase
    .auth()
    .signInWithEmailAndPassword(user.email, user.password)
    .then(data => {
      return data.user.getIdToken();
    })
    .then(token => {
      return res.json({ token });
    })
    .catch(err => {
      if (
        err.code === "auth/wrong-password" ||
        err.code === "auth/user-not-found"
      ) {
        return res.status(400).json({
          general:
            "Wrong Credentials. Please try again with a valid email and password"
        });
      } else {
        return res.status(500).json({
          error: err.code
        });
      }
    });
}




exports.markNotificationsRead = (req, res) => {
  let batch = db.batch();
  req.body.forEach((notificationId) => {
    const notifiaction = db.doc(`/notifications/${notificationId}`);
    batch.update(notifiaction, { read: true });
  });
  batch.commit().then(
    () => {
      return res.json({ message: 'Notifications marked read' });
  }).catch(
    (err) => {
      console.error(err);
      return res.status(500).json({
        error: err.code
      });
    }
  );
}
