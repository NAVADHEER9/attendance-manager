import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
dotenv.config();
const app=express(); app.use(express.json());
app.use(cors({origin:process.env.CLIENT_ORIGIN?.split(',')||true}));
const {Pool}=pg;
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.DATABASE_URL?.includes('render.com')?{rejectUnauthorized:false}:undefined});
const q=(sql,params=[])=>pool.query(sql,params);
async function init(){
 await q(`CREATE TABLE IF NOT EXISTS students(id SERIAL PRIMARY KEY,roll_no TEXT UNIQUE NOT NULL,name TEXT NOT NULL,department TEXT NOT NULL DEFAULT 'IT',year_no INT NOT NULL DEFAULT 2,active BOOLEAN NOT NULL DEFAULT TRUE)`);
 await q(`CREATE TABLE IF NOT EXISTS subjects(id SERIAL PRIMARY KEY,code TEXT UNIQUE NOT NULL,name TEXT NOT NULL,faculty TEXT NOT NULL DEFAULT 'Faculty')`);
 await q(`CREATE TABLE IF NOT EXISTS attendance(id SERIAL PRIMARY KEY,student_id INT REFERENCES students(id) ON DELETE CASCADE,subject_id INT REFERENCES subjects(id) ON DELETE CASCADE,att_date DATE NOT NULL,status TEXT NOT NULL CHECK(status IN ('Present','Absent')),UNIQUE(student_id,subject_id,att_date))`);
 const s=await q('SELECT COUNT(*) FROM students');
 if(Number(s.rows[0].count)===0){
  await q(`INSERT INTO students(roll_no,name,department,year_no) VALUES ('IT2301','Aarav Sharma','IT',2),('IT2302','Diya Reddy','IT',2),('IT2303','Rahul Kumar','IT',2),('IT2304','Meera Nair','IT',2),('IT2305','Arjun Rao','IT',2),('IT2306','Sana Khan','IT',2)`);
  await q(`INSERT INTO subjects(code,name,faculty) VALUES ('CS201','Data Structures','Prof. Sharma'),('CS202','Database Systems','Prof. Reddy'),('CS203','Java Programming','Prof. Kumar'),('CS204','Computer Networks','Prof. Nair')`);
  const students=(await q('SELECT id FROM students')).rows, subs=(await q('SELECT id FROM subjects')).rows;
  for(let d=1;d<=20;d++) for(const st of students) for(const sub of subs){
   const absent=(st.id===3&&d%3===0)||(st.id===5&&d%4===0)||(st.id===2&&sub.id===2&&d%5===0);
   await q('INSERT INTO attendance(student_id,subject_id,att_date,status) VALUES($1,$2,CURRENT_DATE-$3,$4)',[st.id,sub.id,20-d,absent?'Absent':'Present']);
  }
 }
}
const javaUrl=()=>process.env.JAVA_SERVICE_URL||'http://localhost:8080';
async function calculate(records){
 try {const r=await fetch(`${javaUrl()}/api/calculate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(records)});if(r.ok)return await r.json()}catch{}
 return records.map(x=>({...x,total:Number(x.total),present:Number(x.present),percentage:Number(x.total)?Math.round(Number(x.present)/Number(x.total)*1000)/10:0}));
}
app.get('/api/health',(_,res)=>res.json({ok:true,service:'Attendance Manager API'}));
app.post('/api/auth/login',(req,res)=>{const {email,password}=req.body||{};const users={'admin@college.edu':{password:'admin123',role:'Administrator',name:'Administrator'},'faculty@college.edu':{password:'faculty123',role:'Faculty',name:'Faculty Member'}};const u=users[email];if(!u||u.password!==password)return res.status(401).json({error:'Invalid email or password'});res.json({token:'demo-'+u.role.toLowerCase(),user:{email,role:u.role,name:u.name}})});
app.get('/api/students',async(req,res)=>{try{const r=await q(`SELECT s.*,COALESCE(a.total,0)::int total,COALESCE(a.present,0)::int present FROM students s LEFT JOIN (SELECT student_id,COUNT(*) total,COUNT(*) FILTER(WHERE status='Present') present FROM attendance GROUP BY student_id)a ON a.student_id=s.id WHERE s.active=true ORDER BY s.roll_no`);res.json(await calculate(r.rows))}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/students',async(req,res)=>{try{const {roll_no,name,department='IT',year_no=2}=req.body;const r=await q('INSERT INTO students(roll_no,name,department,year_no) VALUES($1,$2,$3,$4) RETURNING *',[roll_no,name,department,year_no]);res.status(201).json(r.rows[0])}catch(e){res.status(400).json({error:e.code==='23505'?'Roll number already exists':e.message})}});
app.put('/api/students/:id',async(req,res)=>{try{const {name,department,year_no}=req.body;const r=await q('UPDATE students SET name=COALESCE($1,name),department=COALESCE($2,department),year_no=COALESCE($3,year_no) WHERE id=$4 RETURNING *',[name,department,year_no,req.params.id]);res.json(r.rows[0]||{})}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/students/:id',async(req,res)=>{try{await q('UPDATE students SET active=false WHERE id=$1',[req.params.id]);res.json({ok:true})}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/subjects',async(_,res)=>{try{res.json((await q('SELECT * FROM subjects ORDER BY code')).rows)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/subjects',async(req,res)=>{try{const {code,name,faculty='Faculty'}=req.body;res.status(201).json((await q('INSERT INTO subjects(code,name,faculty) VALUES($1,$2,$3) RETURNING *',[code,name,faculty])).rows[0])}catch(e){res.status(400).json({error:'Could not add subject. Check that its code is unique.'})}});
app.get('/api/attendance',async(req,res)=>{try{const {date,subjectId}=req.query;const params=[],where=[];if(date){params.push(date);where.push(`a.att_date=$${params.length}`)}if(subjectId){params.push(subjectId);where.push(`a.subject_id=$${params.length}`)}const r=await q(`SELECT a.*,s.roll_no,s.name student_name,sub.code subject_code,sub.name subject_name FROM attendance a JOIN students s ON s.id=a.student_id JOIN subjects sub ON sub.id=a.subject_id ${where.length?'WHERE '+where.join(' AND '):''} ORDER BY a.att_date DESC,s.roll_no LIMIT 500`,params);res.json(r.rows)}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/attendance/bulk',async(req,res)=>{const {date,subjectId,records}=req.body||{};if(!date||!subjectId||!Array.isArray(records))return res.status(400).json({error:'date, subjectId and records are required'});const client=await pool.connect();try{await client.query('BEGIN');for(const rec of records)await client.query(`INSERT INTO attendance(student_id,subject_id,att_date,status) VALUES($1,$2,$3,$4) ON CONFLICT(student_id,subject_id,att_date) DO UPDATE SET status=EXCLUDED.status`,[rec.studentId,subjectId,date,rec.status==='Absent'?'Absent':'Present']);await client.query('COMMIT');res.json({ok:true,saved:records.length})}catch(e){await client.query('ROLLBACK');res.status(400).json({error:e.message})}finally{client.release()}});
app.get('/api/reports',async(_,res)=>{try{const raw=(await q(`SELECT s.id,s.roll_no,s.name,s.department,COUNT(a.id)::int total,COUNT(a.id) FILTER(WHERE a.status='Present')::int present,COUNT(a.id) FILTER(WHERE a.status='Absent')::int absent FROM students s LEFT JOIN attendance a ON a.student_id=s.id WHERE s.active=true GROUP BY s.id ORDER BY s.roll_no`)).rows;res.json(await calculate(raw))}catch(e){res.status(500).json({error:e.message})}});
const port=process.env.PORT||4000;
init().then(()=>app.listen(port,'0.0.0.0',()=>console.log(`API listening on ${port}`))).catch(e=>{console.error('Database initialization failed',e);process.exit(1)});
