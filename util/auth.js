const { admin, db } = require("./admin");

module.exports = (req, res, next) => {
    let id_token;
    if (
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer ")
    ) {
        id_token = req.headers.authorization.split("Bearer ")[1];
    } else {
        return res.status(403).json({
            error: "Unauthorized"
        });
    }
    admin
        .auth()
        .verifyIdToken(id_token)
        .then(decoded_token => {
            req.user = decoded_token;
            return db
                .collection("users")
                .where("userId", "==", req.user.uid)
                .limit(1)
                .get();
        })
        .then(data => {
            req.user.handle = data.docs[0].data().handle;
            req.user.imageUrl = data.docs[0].data().imageUrl;
            return next();
        })
        .catch(err => {
            return res.status(403).json(err);
        });
}
