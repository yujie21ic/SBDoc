/**
 * Created by sunxin on 2016/11/20.
 */
var async=require("asyncawait/async")
var await=require("asyncawait/await")
var e=require("../../util/error.json");
var util=require("../../util/util");
var con=require("../../../config.json");
var user=require("../../model/userModel")
var project=require("../../model/projectModel")
var group=require("../../model/groupModel")
var groupVersion=require("../../model/groupVersionModel")
var interface=require("../../model/interfaceModel")
var interfaceVersion=require("../../model/interfaceVersionModel")
var interfaceSnapshot=require("../../model/interfaceSnapshotModel")
var version=require("../../model/versionModel")
var teamGroup=require("../../model/teamGroupModel")
var fs=require("fs");
var uuid=require("uuid/v1");
let refreshInterface=async (function (req,id) {
    let query={
        project:id
    }
    if(req.headers["docleverversion"])
    {
        query.version=req.headers["docleverversion"]
    }
    let arr=await (req.groupModel.findAsync(query,"_id name type",{
        sort:"name"
    }));
    for(let obj of arr)
    {
        let arrInterface=await (req.interfaceModel.findAsync({
            group:obj._id
        },"_id name method finish url",{
            sort:"name"
        }));
        obj._doc.data=arrInterface;
    }
    return arr;
})

var validateUser =async (function validateUser(req) {
    let obj,pro;
    req.interfaceModel=interface;
    req.groupModel=group;
    if(req.headers["docleverversion"])
    {
        req.version=await (version.findOneAsync({
            _id:req.headers["docleverversion"]
        }))
        if(!req.version)
        {
            util.throw(e.versionInvalidate,"版本不可用");
        }
        req.interfaceModel=interfaceVersion;
        req.groupModel=groupVersion;
    }
    if(req.headers["docleversnapshot"])
    {
        req.interfaceModel=interfaceSnapshot;
    }
    if(req.clientParam.id)
    {
        let obj=await (req.interfaceModel.findOneAsync(req.clientParam.id.length==24?{
            _id:req.clientParam.id
        }:{
            id:req.clientParam.id,
            project:req.clientParam.project
        }));
        if(!obj)
        {
            util.throw(e.interfaceNotFound,"接口不存在或者该接口被锁定不可移动");
        }
        req.interface=obj;
        pro=obj.project;
    }
    else
    {
        pro=req.clientParam.project;
    }
    if(pro)
    {
        obj=await (project.findOneAsync({
            _id:pro,
            $or:[
                {
                    owner:req.userInfo._id
                },
                {
                    "users.user":req.userInfo._id
                }
            ]
        }))
        if(!obj)
        {
            obj=await (project.findOneAsync({
                _id:pro
            }));
            if(!obj)
            {
                util.throw(e.projectNotFound,"项目不存在");
                return;
            }
            if(obj.team)
            {
                let arrUser=await (teamGroup.findAsync({
                    team:obj.team,
                    users:{
                        $elemMatch:{
                            user:req.userInfo._id,
                            role:{
                                $in:[0,2]
                            }
                        }
                    }
                }))
                if(arrUser.length==0)
                {
                    util.throw(e.userForbidden,"你没有权限");
                    return;
                }
            }
            else
            {
                util.throw(e.userForbidden,"你没有权限");
                return;
            }
        }
        req.project=obj;
        if(obj.owner.toString()==req.userInfo._id.toString())
        {
            req.access=1;
        }
        else
        {
            for(let o of obj.users)
            {
                if(o.user.toString()==req.userInfo._id.toString())
                {
                    if(o.role==0)
                    {
                        req.access=1;
                    }
                    else
                    {
                        req.access=0;
                    }
                    break;
                }
            }
        }
    }
    if(req.clientParam.group)
    {
        let g=await (req.groupModel.findOneAsync({
            _id:req.clientParam.group
        }));
        if(!g)
        {
            util.throw(e.groupNotFound,"分组不存在")
        }
        else
        {
            req.group=g;
        }
    }
})

function create(req,res) {
    try
    {
        await (validateUser(req));
        if(req.access==0)
        {
            util.throw(e.userForbidden,"没有权限");

        }
        let update={

        };
        for(let key in req.clientParam)
        {
            if(key!="id" && req.clientParam[key]!==undefined)
            {
                if(key=="queryParam" || key=="header" || key=="bodyParam" || key=="outParam" || key=="restParam" || key=="bodyInfo" || key=="outInfo" || key=="before" || key=="after")
                {
                    if(req.clientParam[key]!=="")
                    {
                        update[key]=JSON.parse(req.clientParam[key]);
                    }
                }
                else
                {
                    update[key]=req.clientParam[key];
                }

            }
        }
        if(req.clientParam.id)
        {
            if(update.method=="GET" || update.method=="DELETE")
            {
                update["$unset"]={
                    bodyInfo:1
                };
                update.bodyParam=[];
            }
            update.editor=req.userInfo._id;
            if(req.headers["docleversnapshot"])
            {
                update.snapshot=req.headers["docleversnapshotdis"];
            }
            let obj=await (req.interfaceModel.findOneAndUpdateAsync({
                _id:req.clientParam.id
            },update,{
                new:false
            }));
            if(req.clientParam.group)
            {
                if(obj.group.toString()!=req.clientParam.group)
                {
                    if(req.interfaceModel!=interfaceSnapshot)
                    {
                        let query={
                            id:obj.id,
                            project:obj.project
                        };
                        if(req.headers["docleverversion"])
                        {
                            query.version=req.headers["docleverversion"]
                        }
                        else
                        {
                            query.version={
                                $exists:false
                            }
                        }
                        await (interfaceSnapshot.updateAsync(query,{
                            group:req.clientParam.group
                        }));
                    }
                    let arr=await (refreshInterface(req,req.project._id.toString()))
                    util.ok(res,arr,"修改成功");
                    return;
                }
            }
            util.ok(res,obj._id,"修改成功");
        }
        else
        {
            if(update.method=="GET" || update.method=="DELETE")
            {
                if(update.bodyInfo)
                {
                    delete update.bodyInfo;
                }
                update.bodyParam=[];
            }
            update.owner=req.userInfo._id;
            update.editor=req.userInfo._id;
            update.id=uuid();
            if(req.headers["docleverversion"])
            {
                update.version=req.headers["docleverversion"]
            }
            let obj=await (req.interfaceModel.createAsync(update))
            util.ok(res,obj,"新建成功");
        }
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function remove(req,res) {
    try
    {
        await (validateUser(req));
        if(req.access==0)
        {
            util.throw(e.userForbidden,"没有权限");

        }
        let query={
            project:req.project._id,
            type:1
        }
        if(req.headers["docleverversion"])
        {
            query.version=req.headers["docleverversion"]
        }
        let obj=await (req.groupModel.findOneAsync(query))
        req.interface.group=obj._id;
        await (req.interface.saveAsync())
        query={
            id:req.interface.id,
            project:req.project._id
        };
        if(req.headers["docleverversion"])
        {
            query.version=req.headers["docleverversion"]
        }
        else
        {
            query.version={
                $exists:false
            }
        }
        await (interfaceSnapshot.updateAsync(query,{
            group:obj._id
        }));
        let arr=await (refreshInterface(req,req.project._id));
        util.ok(res,arr,"已移到回收站");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function move(req,res) {
    try
    {
        await (validateUser(req));
        if(req.access==0)
        {
            util.throw(e.userForbidden,"没有权限");

        }
        else if(req.headers["docleversnapshot"])
        {
            util.throw(e.systemReason,"快照状态下不可移动");
        }
        let update={};
        update.group=req.group._id;
        await (req.interfaceModel.updateAsync({
            _id:req.clientParam.id
        },update))
        let query={
            id:req.interface.id,
            project:req.project._id
        };
        if(req.headers["docleverversion"])
        {
            query.version=req.headers["docleverversion"]
        }
        else
        {
            query.version={
                $exists:false
            }
        }
        await (interfaceSnapshot.updateAsync(query,update));
        util.ok(res,"移动成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function info(req,res) {
    try
    {
        await (validateUser(req));
        let obj=await (req.interfaceModel.populateAsync(req.interface,{
            path:"project",
            select:"name"
        }))
        if(obj.group)
        {
            obj=await (req.interfaceModel.populateAsync(obj,{
                path:"group",
                select:"name"
            }))
        }
        if(obj.owner)
        {
            obj=await (req.interfaceModel.populateAsync(obj,{
                path:"owner",
                select:"name"
            }))
        }
        if(obj.editor)
        {
            obj=await (req.interfaceModel.populateAsync(obj,{
                path:"editor",
                select:"name"
            }))
        }
        if(req.clientParam.group && obj.group._id.toString()!=req.clientParam.group && req.clientParam.group.length==24)
        {
            obj._doc.change=1;
        }
        if(req.clientParam.run)
        {
            obj._doc.baseUrl=req.project.baseUrls;
        }
        util.ok(res,obj,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function share(req,res) {
    try
    {
        let interfaceModel=interface;
        let inter=await (interfaceModel.findOneAsync({
            _id:req.clientParam.id
        }));
        if(!inter)
        {
            interfaceModel=interfaceVersion;
            inter=await (interfaceModel.findOneAsync({
                _id:req.clientParam.id
            }));
            if(!inter)
            {
                interfaceModel=interfaceSnapshot;
                inter=await (interfaceModel.findOneAsync({
                    _id:req.clientParam.id
                }));
                if(!inter)
                {
                    util.throw(e.interfaceNotFound,"接口不存在");
                }
            }
        }
        let obj=await (interfaceModel.populateAsync(inter,{
            path:"project",
            select:"name"
        }))
        if(obj.group)
        {
            obj=await (interfaceModel.populateAsync(obj,{
                path:"group",
                select:"name"
            }))
        }
        if(obj.owner)
        {
            obj=await (interfaceModel.populateAsync(obj,{
                path:"owner",
                select:"name"
            }))
        }
        if(obj.editor)
        {
            obj=await (interfaceModel.populateAsync(obj,{
                path:"editor",
                select:"name"
            }))
        }
        util.ok(res,obj,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function destroy(req,res) {
    try
    {
        await (validateUser(req));
        if(req.access==0)
        {
            util.throw(e.userForbidden,"没有权限");

        }
        await (req.interface.removeAsync())
        let query={
            id:req.interface.id,
            project:req.project._id
        }
        if(req.headers["docleverversion"])
        {
            query.version=req.headers["docleverversion"];
        }
        else
        {
            query.version={
                $exists:false
            }
        }
        await (interfaceSnapshot.removeAsync(query))
        let arr=await (refreshInterface(req,req.project._id));
        util.ok(res,arr,"删除成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function exportJSON(req,res) {
    try
    {
        await (validateUser(req));
        let obj={
            flag:"SBDoc",
        };
        for(let key in req.interface._doc)
        {
            if(req.interface._doc.hasOwnProperty(key) && key!="__v" && key!="_id" && key!="_id" && key!="project" && key!="group" && key!="owner" && key!="editor")
            {
                obj[key]=req.interface._doc[key];
            }
        }
        let content=JSON.stringify(obj);
        res.writeHead(200,{
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename*=UTF-8\'\''+encodeURIComponent(req.interface.name)+".json",
            "Transfer-Encoding": "chunked",
            "Expires":0,
            "Cache-Control":"must-revalidate, post-check=0, pre-check=0",
            "Content-Transfer-Encoding":"binary",
            "Pragma":"public",
        });
        res.end(content);
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function importJSON(req,res) {
    try
    {
        await (validateUser(req));
        let obj;
        try
        {
            obj=JSON.parse(req.clientParam.json);
        }
        catch (err)
        {
            util.throw(e.systemReason,"json解析错误");
            return;
        }
        if(obj.flag!="SBDoc")
        {
            util.throw(e.systemReason,"不是DOClever的导出格式");
            return;
        }
        let objGroup=await (req.groupModel.findOneAsync({
            _id:req.clientParam.group
        }))
        if(!objGroup)
        {
            util.throw(e.groupNotFound,"分组不存在");
            return;
        }
        obj.project=objGroup.project;
        obj.group=objGroup._id;
        obj.owner=req.userInfo._id;
        obj.editor=req.userInfo._id;
        if(req.headers["docleverversion"])
        {
            obj.version=req.headers["docleverversion"]
        }
        obj=await (req.interfaceModel.createAsync(obj));
        util.ok(res,obj,"导入成功");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function createSnapshot(req,res) {
    try
    {
        await (validateUser(req));
        delete req.interface._doc._id;
        delete req.interface._doc.createdAt;
        delete req.interface._doc.updatedAt;
        req.interface._doc.snapshot=req.clientParam.dis;
        req.interface._doc.snapshotCreator=req.userInfo._id;
        if(req.headers["docleverversion"])
        {
            req.interface._doc.version=req.headers["docleverversion"];
            req.interface._doc.groupType="GroupVersion";
        }
        else
        {
            req.interface._doc.groupType="Group";
        }
        await (interfaceSnapshot.createAsync(req.interface._doc));
        util.ok(res,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function snapshotList(req,res) {
    try
    {
        await (validateUser(req));
        let query={
            project:req.interface.project,
            id:req.interface.id
        }
        if(req.headers["docleverversion"])
        {
            query.version=req.headers["docleverversion"]
        }
        else
        {
            query.version={
                $exists:false
            }
        }
        let arr=await (interfaceSnapshot.findAsync(query,"",{
            sort:"-createdAt",
            populate:{
                path:"version"
            },
            skip:req.clientParam.page*10,
            limit:10
        }));
        arr=await (interfaceSnapshot.populateAsync(arr,{
            path:"snapshotCreator",
            select:"name photo"
        }))
        util.ok(res,arr,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function removeSnapshot(req,res) {
    try
    {
        await (validateUser(req));
        await (req.interface.removeAsync());
        util.ok(res,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

function snapshotRoll(req,res) {
    try
    {
        await (validateUser(req));
        let obj=await (interface.findOneAsync({
            id:req.interface.id,
            project:req.interface.project
        }));
        if(!obj)
        {
            util.throw(e.interfaceNotFound,"接口不存在");
        }
        delete req.interface._doc._id;
        delete req.interface._doc.snapshot;
        delete req.interface._doc.snapshotCreator;
        delete req.interface._doc.version;
        delete req.interface._doc.groupType;
        delete req.interface._doc.createdAt;
        delete req.interface._doc.updatedAt;
        await (interface.updateAsync({
            _id:obj._id
        },req.interface._doc));
        util.ok(res,"ok");
    }
    catch (err)
    {
        util.catch(res,err);
    }
}

exports.create=async (create);
exports.remove=async (remove);
exports.move=async (move);
exports.info=async (info);
exports.destroy=async (destroy);
exports.exportJSON=async (exportJSON);
exports.importJSON=async (importJSON);
exports.share=async (share);
exports.createSnapshot=async (createSnapshot);
exports.snapshotList=async (snapshotList);
exports.removeSnapshot=async (removeSnapshot);
exports.snapshotRoll=async (snapshotRoll);







