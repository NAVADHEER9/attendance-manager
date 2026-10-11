package edu.attendance;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping("/api")
public class CalculationController {
 @GetMapping("/health") public Map<String,Object> health(){return Map.of("ok",true,"service","Java attendance processor");}
 @PostMapping("/calculate")
 public List<Map<String,Object>> calculate(@RequestBody List<Map<String,Object>> records){
  List<Map<String,Object>> out=new ArrayList<>();
  for(Map<String,Object> item:records){
   Map<String,Object> row=new LinkedHashMap<>(item);
   double total=num(item.get("total")), present=num(item.get("present"));
   row.put("total",(int)total); row.put("present",(int)present);
   row.put("percentage",total==0?0.0:Math.round(present/total*1000.0)/10.0);
   out.add(row);
  }
  return out;
 }
 private double num(Object x){try{return Double.parseDouble(String.valueOf(x));}catch(Exception e){return 0;}}
}