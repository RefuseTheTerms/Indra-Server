const functions = require('firebase-functions');
const cors = require('cors')({ origin: true });
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp({
    credential: admin.credential.cert('./service-account-credentials.json')
});

const db = admin.firestore();

exports.signUp = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {
        if(req.method !== 'POST') {
            return res.status(401).json({
                error: 'Not Allowed'
            });
        }

        const token = req.query.token;
        let name = req.body.name.trim();
        let username = name.toLowerCase();
        username = username.replace(/[^A-Z0-9]/ig, "");
        username = `${username}${crypto.randomBytes(4).toString('hex')}`;


        if(name.length > 16) {
            admin.auth().verifyIdToken(token).then(decodedToken => {
                admin.auth().deleteUser(decodedToken.user_id);
            });
            return res.status(400).json({
                error: 'Username is too long.'
            });
        }

        if(name.length < 3) {
            admin.auth().verifyIdToken(token).then(decodedToken => {
                admin.auth().deleteUser(decodedToken.user_id);
            });
            return res.status(400).json({
                error: 'Username is too short.'
            })
        }

        admin.auth().verifyIdToken(token).then(decodedToken => {
            const userRef = db.collection("users").doc(decodedToken.user_id);
            userRef.get().then(userShot => {
                if(userShot.exists) {
                    return res.status(400).json({
                        error: 'Username already taken.'
                    });
                } else {
                    let avatar = ('#' + ((Math.random() * 0xffffff) << 0).toString(16) + '000000').slice(0, 7);

                    let newUser = {
                        email: decodedToken.email,
                        name: username,
                        displayName: name,
                        avatar:`#${avatar}`,
                        reputation:0,
                        tags:[],
                        sites:[],
                        archived:false
                    };

                    userRef.set(newUser);

                    let userData = {
                        name: newUser.name,
                        displayName: newUser.displayName,
                        avatar: newUser.avatar,
                        reputation:0,
                        tags:[],
                        sites:[]
                    };

                    return res.status(200).json({
                        success: `Welcome, ${newUser.displayName}!`,
                        user: userData
                    })
                }
            })
        });
    });
});

exports.signIn = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {
        if(req.method !== 'POST') {
            return res.status(401).json({
                error: 'Not Allowed'
            });
        }

        const token = req.query.token;

        admin.auth().verifyIdToken(token).then(decodedToken => {
            const userRef = db.collection("users").doc(decodedToken.user_id);
            userRef.get().then(userShot => {
                if(userShot.exists) {
                    let userData = {
                        name: userShot.data().name,
                        displayName: userShot.data().displayName,
                        avatar: userShot.data().avatar,
                        reputation:userShot.data().reputation,
                        tags:userShot.data().tags,
                        sites:userShot.data().sites
                    };

                    return res.status(200).json({
                        success: `Welcome back, ${userData.displayName}!`,
                        user: userData
                    })
                } else {
                   return res.status(400).json({
                       error: 'User not found.'
                   })
                }
            })
        });
    });
});

exports.storeHistory = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {
        if(req.method !== 'POST') {
            return res.status(401).json({
                error: 'Not Allowed'
            })
        }

        const token = req.query.token;
        let site = req.body.site;
        let siteName = req.body.siteName;

        admin.auth().verifyIdToken(token).then(decodedToken => {
            const userRef = db.collection("users").doc(decodedToken.user_id);
            userRef.get().then(userShot => {
                if(userShot.exists) {
                    let userData = userShot.data();
                    let siteCheck = false;

                    userData.sites.forEach((s, i) => {
                        if(s.url === site) {
                            s.lastVisit = new Date();
                            userData.sites.unshift(userData.sites.splice(i, 1)[0]);
                            siteCheck = true;
                        }
                    })

                    if(siteCheck === false) {
                        let newSite = {
                            url: site,
                            siteName: siteName,
                            firstVisit: new Date(),
                            lastVisit: new Date(),
                            tags:[]
                        };

                        userData.sites.unshift(newSite);
                    }

                    userRef.update(userData);

                    return res.status(200).json({
                        sites: userData.sites
                    })
                }
            })
        })
    });
});

exports.removeTag = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {
        if(req.method !== 'POST') {
            return res.status(401).json({
                error: 'Not Allowed'
            })
        }

        const token = req.query.token;
        let tagSite = req.body.site;
        let tag = req.body.tag;

        admin.auth().verifyIdToken(token).then(decodedToken => {
            const userRef = db.collection("users").doc(decodedToken.user_id);
            userRef.get().then(userShot => {
                if(userShot.exists) {
                    let userData = userShot.data();
                    
                    userData.sites.forEach((site, i) => {
                        if(site.url === tagSite) {
                            site.tags.splice(site.tags.indexOf(tag), 1);
                        }
                    })

                    userData.tags.forEach((t, i) => {
                        if(t.name === tag) {
                            t.count--;
                            if(t.count === 0) {
                                userData.tags.splice(i, 1);
                            }
                        }
                    })

                    userRef.update(userData);

                    return res.status(200).json({
                        sites: userData.sites,
                        tags: userData.tags
                    })
                }
            });
        });
    });
});


exports.storeTag = functions.https.onRequest((req, res) => {
    return cors(req, res, () => {
        if(req.method !== 'POST') {
            return res.status(401).json({
                error: 'Not Allowed'
            })
        }

        const token = req.query.token;
        let tagSite = req.body.site;
        let tag = req.body.tag;

        admin.auth().verifyIdToken(token).then(decodedToken => {
            const userRef = db.collection("users").doc(decodedToken.user_id);
            userRef.get().then(userShot => {
                if(userShot.exists) {
                    let userData = userShot.data();
                    let siteCheck = false;
                    let tagCheck = false;
                
                    userData.sites.forEach((site, i) => {
                        if(site.url === tagSite) {
                            if(site.tags.includes(tag)) {
                                siteCheck = true;
                                //site.tags.splice(site.tags.indexOf(tag), 1);
                            } else {
                                site.tags.unshift(tag);
                            }
                        }
                    })

                    if(siteCheck === false) {
                        userData.tags.forEach((t, i) => {
                            if(t.name === tag) {
                                t.count++;
                                tagCheck = true;
                            }
                        })

                        if(tagCheck === false) {
                            let newTag = {
                                name: tag,
                                count: 1,
                                svg: {fill:'#1abc9c'}
                            };
                            userData.tags.unshift(newTag);
                        }
                    }

                    userRef.update(userData);

                    return res.status(200).json({
                        sites: userData.sites,
                        tags: userData.sites
                    })
                }
            })
        })
    })
})