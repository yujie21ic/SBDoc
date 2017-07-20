/**
 * Created by sunxin on 2016/11/9.
 */
var async=require("asyncawait/async")
var await=require("asyncawait/await")
var e=require("../../util/error.json");
var util=require("../../util/util");
var con=require("../../../config.json");
var user=require("../../model/userModel")
var group=require("../../model/groupModel")
var apply=require("../../model/applyModel")
var project=require("../../model/projectModel")
var team=require("../../model/teamModel")
var teamGroup=require("../../model/teamGroupModel")
var message=require("../../model/messageModel")
var fs=require("fs");

let existUserInTeam=async (function (teamId,userId) {
    let arrUser=await (teamGroup.findAsync({
        team:teamId
    }))
    let bFind=false;
    for(let obj of arrUser) {
        for (let obj1 of obj.users) {
            if(obj1.user.toString()==userId.toString())
            {
                bFind=true;
                break;
            }
        }
        if(bFind)
        {
            break;
        }
    }
    if(bFind)
    {
        return true;
    }
    else
    {
        return false;
    }
})

function login(req,res) {
    try
    {
        let obj= await (user.findOneAsync({
            name:req.clientParam.name,
            password:req.clientParam.password
        },"-password -question -answer"));
        if(obj)
        {
            req.session.userid=obj._id;
            obj.lastLoginDate=Date.now();
            obj.loginCount++;
            await (obj.saveAsync());
            util.ok(res,obj,"ok");
        }
        else
        {
            util.throw(e.userOrPwdWrong,"用户名或者密码错误");
        }
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function save(req,res) {
    try
    {
        if(req.clientParam.userid)
        {
            let update={};
            for(let key in req.clientParam)
            {
                if(key!="userid")
                {
                    update[key]=req.clientParam[key];
                }
            }
            if(update.name)
            {
                let ret=await (user.findOneAsync({
                    name:update.name
                }));
                if(ret)
                {
                    util.throw(e.duplicateUser,"用户名重复");
                }
            }
            let obj=await (user.findOneAndUpdateAsync({
                _id:req.clientParam.userid
            },update,{
                new:false
            }));
            if(!obj)
            {
                util.throw(e.userNotFound,"用户不存在");
            }
            else if(req.clientParam.photo && obj.photo && req.clientParam.photo!=obj.photo)
            {
                util.delImg(obj.photo);
            }
            obj=await (user.findOneAsync({
                _id:req.clientParam.userid
            },"-password"))
            util.ok(res,obj,"ok");
        }
        else
        {
            let obj={};
            for(let key in req.clientParam)
            {
                obj[key]=req.clientParam[key];
            }
            if(!obj.name || !obj.password)
            {
                util.throw(e.paramWrong,"姓名密码不能为空");
            }
            let ret=await (user.findOneAsync({
                name:obj.name
            }));
            if(ret)
            {
                util.throw(e.duplicateUser,"用户名重复");
            }
            obj=await (user.createAsync(obj));
            delete obj._doc.password;
            util.ok(res,obj,"ok");
        }
    }
    catch (err)
    {
        req.arrFile.forEach(function (obj) {
            util.delImg(obj.dbPath);
        });
        util.catch(res,err);
    }
}

function logout(req,res) {
    try
    {
        req.session.destroy();
        util.ok(res,"退出成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function editPass(req,res) {
    try
    {
        if(req.userInfo.password!=req.clientParam.oldpass)
        {
            util.throw(e.userOrPwdWrong,"密码错误");
        }
        req.userInfo.password=req.clientParam.newpass;
        await (req.userInfo.saveAsync());
        util.ok(res,"修改成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function reset(req,res) {
    try
    {
        let obj=await (user.findOneAsync({
            name:req.clientParam.name
        }));
        if(!obj)
        {
            util.throw(e.userNotFound,"用户不存在");
        }
        if(obj.answer!=req.clientParam.answer)
        {
            util.throw(e.userOrPwdWrong,"答案错误");
        }
        obj.password=req.clientParam.password;
        await (obj.saveAsync());
        util.ok(res,"修改成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function question(req,res) {
    try
    {
        let obj=await (user.findOneAsync({
            name:req.clientParam.name
        }));
        if(!obj)
        {
            util.throw(e.userNotFound,"用户不存在");
        }
        if(obj.question=="")
        {
            util.throw(e.questionIsEmpty,"找回密码问题不存在");
        }
        util.ok(res,obj.question,"获取成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function applyList(req,res) {
    try
    {
        let arr=await (apply.findAsync({
            to:req.userInfo._id,
            type:0,
            state:0
        },null,{
            populate:{
                path:"creator",
                select:"name photo"
            },
            sort:"-createdAt"
        }));
        arr=await (apply.populateAsync(arr,{
            path:"from",
            select:"name"
        }));
        util.ok(res,arr,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function handleApply(req,res) {
    try
    {
        let obj=await (apply.findOneAsync({
            _id:req.clientParam.apply
        },null,{
            populate:{
                path:"from",
                select:"name"
            }
        }));
        if(!obj)
        {
            util.throw(e.applyNotFound,"申请不存在");
        }
        else if(obj.state!=0)
        {
            util.throw(e.applyAlreadyHandle,"申请已经处理过了");
        }
        let objTeam=await (team.findOneAsync({
            _id:obj.from._id
        }))
        if(!objTeam)
        {
            util.throw(e.teamNotFound,"团队不存在");
        }
        obj.editor=req.userInfo._id;
        if(await (existUserInTeam(obj.from._id,req.userInfo._id)))
        {
            obj.state=3;
            await (obj.saveAsync());
            util.throw(e.userAlreadyInTeam,"用户已经在团队中");
        }
        obj.state=req.clientParam.state;
        if(req.clientParam.state==1)
        {
            let objGroup=await (teamGroup.findOneAndUpdateAsync({
                _id:obj.relatedData
            },{
                $addToSet:{
                    users:{
                        user:req.userInfo._id,
                        role:1
                    }
                }
            }))
            if(!objGroup)
            {
                obj.state=3;
                await (obj.saveAsync());
                util.throw(e.teamGroupNotFound,"部门不存在");
            }
        }
        await (message.createAsync({
            name:req.clientParam.state==1?"您已同意加入团队":"您已拒绝加入团队",
            dis:`您已${req.clientParam.state==1?"同意":"拒绝"}加入团队${obj.from.name}`,
            user:req.userInfo._id,
            type:1
        }))
        await (obj.saveAsync());
        if(req.clientParam.state==1)
        {
            obj=await (team.findOneAsync({
                _id:objTeam._id
            }))
            let arr=await (teamGroup.findAsync({
                team:obj._id
            }))
            let count=0;
            for(let o of arr)
            {
                count+=o.users.length;
            }
            obj._doc.userCount=count;
            obj._doc.projectCount=await (project.countAsync({
                team:obj._id
            }))
            util.ok(res,obj,"ok");
        }
        else
        {
            util.ok(res,"ok");
        }
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

exports.login=async (login);
exports.save=async (save);
exports.logout=async (logout);
exports.editPass=async (editPass);
exports.reset=async (reset);
exports.question=async (question);
exports.applyList=async (applyList);
exports.handleApply=async (handleApply);










